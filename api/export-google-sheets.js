import { google } from 'googleapis';

const TEMPLATE_ID = '1pc9YlbSVQg5mGD5eh5Nbvr8SNH4t2Thlfr8mPUaMluA';
const OUTPUT_FOLDER_ID = '1utUZnroB5FPJxPSPI12gjovC3YNdHGXH';

function getAuth() {
  const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
  let privateKey = process.env.GOOGLE_PRIVATE_KEY;

  if (!clientEmail || !privateKey) {
    throw new Error('Credenciais Google não configuradas.');
  }

  privateKey = privateKey.replace(/\\n/g, '\n');

  return new google.auth.JWT({
    email: clientEmail,
    key: privateKey,
    scopes: [
      'https://www.googleapis.com/auth/drive',
      'https://www.googleapis.com/auth/spreadsheets'
    ]
  });
}

function parsePayload(body) {
  if (!body) return {};
  if (typeof body === 'string') return JSON.parse(body);
  return body;
}

function safeNumber(value) {
  if (value === null || value === undefined || value === '') return '';
  return value;
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    return res.status(200).json({
      success: true,
      message: 'API da Vercel funcionando.'
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'Método não permitido.'
    });
  }

  try {
    const payload = parsePayload(req.body);
    const {
      cliente = 'Cliente',
      mes = '',
      ano = '',
      campaignsData = [],
      capaData = { fb: {}, ig: {} }
    } = payload;

    const auth = getAuth();
    const drive = google.drive({ version: 'v3', auth });
    const sheets = google.sheets({ version: 'v4', auth });

    const newFileName = ['Relatório de impulsionamento', cliente, mes, ano]
      .filter(Boolean)
      .join(' - ');

    const copied = await drive.files.copy({
      fileId: TEMPLATE_ID,
      requestBody: {
        name: newFileName,
        parents: [OUTPUT_FOLDER_ID]
      }
    });

    const spreadsheetId = copied.data.id;

    if (!spreadsheetId) {
      throw new Error('Não foi possível copiar a planilha modelo.');
    }

    const capaUpdates = [
      { range: 'Capa!A1', values: [[`${cliente} - ${mes} - ${ano}`]] },

      { range: 'Capa!C5', values: [[capaData?.fb?.seguidores || '']] },
      { range: 'Capa!C7', values: [[capaData?.fb?.segAnterior || '']] },
      { range: 'Capa!C9', values: [[capaData?.fb?.homens || '']] },
      { range: 'Capa!E9', values: [[capaData?.fb?.mulheres || '']] },
      { range: 'Capa!C12', values: [[capaData?.fb?.faixa || '']] },
      { range: 'Capa!E12', values: [[capaData?.fb?.alcancadas || '']] },
      { range: 'Capa!F12', values: [[capaData?.fb?.visitas || '']] },

      { range: 'Capa!J5', values: [[capaData?.ig?.seguidores || '']] },
      { range: 'Capa!J7', values: [[capaData?.ig?.segAnterior || '']] },
      { range: 'Capa!J9', values: [[capaData?.ig?.homens || '']] },
      { range: 'Capa!L9', values: [[capaData?.ig?.mulheres || '']] },
      { range: 'Capa!J12', values: [[capaData?.ig?.faixa || '']] },
      { range: 'Capa!L12', values: [[capaData?.ig?.alcancadas || '']] },
      { range: 'Capa!M12', values: [[capaData?.ig?.visitas || '']] }
    ];

    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: {
        valueInputOption: 'USER_ENTERED',
        data: capaUpdates
      }
    });

    await sheets.spreadsheets.values.clear({
      spreadsheetId,
      range: 'Relatório!A3:Q1000'
    });

    const rows = campaignsData.map((r) => [
      r.name || '',
      r.format || '',
      r.validity || '',
      safeNumber(r.budget),
      safeNumber(r.spent),
      safeNumber(r.reach),
      safeNumber(r.eng),
      safeNumber(r.links),
      safeNumber(r.views),
      safeNumber(r.cpm),
      safeNumber(r.cpc),
      safeNumber(r.cThru),
      safeNumber(r.cInt),
      safeNumber(r.cConv),
      '',
      '',
      safeNumber(r.conv)
    ]);

    if (rows.length) {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `Relatório!A3:Q${rows.length + 2}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: rows
        }
      });
    }

    const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;

    return res.status(200).json({
      success: true,
      spreadsheetId,
      url,
      name: newFileName
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Erro interno ao exportar para Google Sheets.'
    });
  }
}
