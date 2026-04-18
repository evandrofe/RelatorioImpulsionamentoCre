const { google } = require('googleapis');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  try {
    const { cliente, mes, ano, campaignsData, capaData } = req.body;

    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      },
      scopes: [
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/drive',
      ],
    });

    const authClient = await auth.getClient();
    const drive = google.drive({ version: 'v3', auth: authClient });
    const sheets = google.sheets({ version: 'v4', auth: authClient });

    const novoNome = ['Relatório', cliente, mes, ano].filter(Boolean).join(' - ');

    // Cria planilha nova do zero (não copia — evita quota da service account)
    const nova = await sheets.spreadsheets.create({
      requestBody: {
        properties: { title: novoNome },
        sheets: [
          { properties: { title: 'Capa' } },
          { properties: { title: 'Relatório' } },
        ],
      },
    });

    const spreadsheetId = nova.data.spreadsheetId;

    // Compartilha com você como editor
    await drive.permissions.create({
      fileId: spreadsheetId,
      requestBody: {
        role: 'writer',
        type: 'user',
        emailAddress: 'evandro.ferraz15@gmail.com',
      },
    });

    // ── CAPA ──
    const fb = capaData?.fb || {};
    const ig = capaData?.ig || {};
    const titulo = [cliente, mes, ano].filter(Boolean).join(' - ');

    const capaValues = [
      [titulo],
      [],
      ['📘 FACEBOOK', '', '', '', '', '', '', '📸 INSTAGRAM'],
      [],
      [`Total de ${fb.seguidores || ''} seguidores`, '', '', '', '', '', '', `Total de ${ig.seguidores || ''} seguidores`],
      [`${fb.segAnterior || ''} seguidores no mês anterior`, '', '', '', '', '', '', `${ig.segAnterior || ''} seguidores no mês anterior`],
      [],
      [`👨 ${fb.homens || ''} Homens`, '', `👩 ${fb.mulheres || ''} Mulheres`, '', '', '', '', `👨 ${ig.homens || ''} Homens`, '', `👩 ${ig.mulheres || ''} Mulheres`],
      [],
      [fb.faixa || '', '', fb.alcancadas || '', fb.visitas || '', '', '', '', ig.faixa || '', '', ig.alcancadas || '', ig.visitas || ''],
      ['FAIXA ETÁRIA', '', 'CONTAS ALCANÇADAS', 'VISITAS À PÁGINA', '', '', '', 'FAIXA ETÁRIA', '', 'CONTAS ALCANÇADAS', 'VISITAS AO PERFIL'],
    ];

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: 'Capa!A1',
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: capaValues },
    });

    // ── RELATÓRIO ──
    const cabecalho = [
      'Nome da Ação', 'Formato', 'Validade', 'Investimento', 'Valor Gasto',
      'Alcance', 'Engajamento', 'Cliques no Link', 'Visualização (ThruPlay)',
      'Custo por 1.000 Pessoas', 'Custo por Cliques no Link', 'Custo por ThruPlay',
      'Custo por Interação', 'Custo por Conversa', 'Filtro', 'Cidade', 'Conversas Iniciadas'
    ];

    const fmtNum = v => (typeof v === 'number' && v > 0) ? v : '';
    const fmtBRL = v => (typeof v === 'number' && v > 0) ? v : '';

    const linhas = campaignsData.map(r => {
      const o = r.objective;
      const isEF = /panfleto|carrossel|virtual|tabloide|post/i.test(r.format);
      return [
        r.name, r.format, r.validity || '',
        fmtBRL(r.budget), fmtBRL(r.spent),
        (o === 'Alcance' || o === 'Reels') ? fmtNum(r.reach) : '',
        (o === 'Engajamento' && isEF) ? fmtNum(r.eng) : '',
        (o === 'EngLink' || o === 'ConvLink') ? fmtNum(r.links) : '',
        o === 'Reels' ? fmtNum(r.views) : '',
        o === 'Alcance' ? fmtBRL(r.cpm) : '',
        (o === 'EngLink' || o === 'ConvLink') ? fmtBRL(r.cpc) : '',
        o === 'Reels' ? fmtBRL(r.cThru) : '',
        (o === 'Engajamento' && isEF) ? fmtBRL(r.cInt) : '',
        o === 'Conversas' ? fmtBRL(r.cConv) : '',
        '', '',
        o === 'Conversas' ? fmtNum(r.conv) : '',
      ];
    });

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: 'Relatório!A1',
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [cabecalho, ...linhas] },
    });

    return res.status(200).json({
      success: true,
      url: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`
    });

  } catch (err) {
    console.error('Erro export Google Sheets:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
};
