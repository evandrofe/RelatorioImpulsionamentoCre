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
      scopes: ['https://www.googleapis.com/auth/drive.file'],
    });

    const authClient = await auth.getClient();
    const drive = google.drive({ version: 'v3', auth: authClient });

    const novoNome = ['Relatório', cliente, mes, ano].filter(Boolean).join(' - ');
    const fb = capaData?.fb || {};
    const ig = capaData?.ig || {};
    const titulo = [cliente, mes, ano].filter(Boolean).join(' - ');

    // Monta CSV simples da aba Relatório
    const cabecalho = [
      'Nome da Ação','Formato','Validade','Investimento','Valor Gasto',
      'Alcance','Engajamento','Cliques no Link','Visualização (ThruPlay)',
      'Custo por 1.000 Pessoas','Custo por Cliques no Link','Custo por ThruPlay',
      'Custo por Interação','Custo por Conversa','Filtro','Cidade','Conversas Iniciadas'
    ];

    const fmtNum = v => (typeof v === 'number' && v > 0) ? v : '';
    const fmtBRL = v => (typeof v === 'number' && v > 0) ? v : '';

    const linhas = campaignsData.map(r => {
      const o = r.objective;
      const isEF = /panfleto|carrossel|virtual|tabloide|post/i.test(r.format);
      return [
        r.name, r.format, r.validity || '',
        fmtBRL(r.budget), fmtBRL(r.spent),
        (o==='Alcance'||o==='Reels') ? fmtNum(r.reach) : '',
        (o==='Engajamento'&&isEF) ? fmtNum(r.eng) : '',
        (o==='EngLink'||o==='ConvLink') ? fmtNum(r.links) : '',
        o==='Reels' ? fmtNum(r.views) : '',
        o==='Alcance' ? fmtBRL(r.cpm) : '',
        (o==='EngLink'||o==='ConvLink') ? fmtBRL(r.cpc) : '',
        o==='Reels' ? fmtBRL(r.cThru) : '',
        (o==='Engajamento'&&isEF) ? fmtBRL(r.cInt) : '',
        o==='Conversas' ? fmtBRL(r.cConv) : '',
        '','',
        o==='Conversas' ? fmtNum(r.conv) : '',
      ];
    });

    const csvEscape = v => {
      const s = String(v ?? '');
      return s.includes(',') || s.includes('"') || s.includes('\n')
        ? '"' + s.replace(/"/g, '""') + '"' : s;
    };

    const csvRows = [cabecalho, ...linhas]
      .map(row => row.map(csvEscape).join(','))
      .join('\n');

    const csvCapa = [
      ['titulo', titulo],
      ['fb_seguidores', fb.seguidores||''],
      ['fb_seg_anterior', fb.segAnterior||''],
      ['fb_homens', fb.homens||''],
      ['fb_mulheres', fb.mulheres||''],
      ['fb_faixa', fb.faixa||''],
      ['fb_alcancadas', fb.alcancadas||''],
      ['fb_visitas', fb.visitas||''],
      ['ig_seguidores', ig.seguidores||''],
      ['ig_seg_anterior', ig.segAnterior||''],
      ['ig_homens', ig.homens||''],
      ['ig_mulheres', ig.mulheres||''],
      ['ig_faixa', ig.faixa||''],
      ['ig_alcancadas', ig.alcancadas||''],
      ['ig_visitas', ig.visitas||''],
    ].map(row => row.map(csvEscape).join(',')).join('\n');

    // Upload do CSV do Relatório como Google Sheets
    const uploadRelatorio = await drive.files.create({
      requestBody: {
        name: novoNome,
        mimeType: 'application/vnd.google-apps.spreadsheet',
        parents: ['1utUZnroB5FPJxPSPI12gjovC3YNdHGXH'],
      },
      media: {
        mimeType: 'text/csv',
        body: csvRows,
      },
    });

    const spreadsheetId = uploadRelatorio.data.id;

    return res.status(200).json({
      success: true,
      url: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`
    });

  } catch (err) {
    console.error('Erro export Google Sheets:', JSON.stringify({
      message: err.message,
      code: err.code,
      status: err.status,
      errors: err.errors,
    }));
    return res.status(500).json({ success: false, error: err.message });
  }
};
