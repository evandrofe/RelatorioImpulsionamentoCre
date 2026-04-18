// Versão OAuth — cria a planilha no Drive do próprio usuário (Vando)
// usando o refresh token armazenado em env var.

const { google } = require('googleapis');

const FOLDER_ID = '1utUZnroB5FPJxPSPI12gjovC3YNdHGXH'; // pasta compartilhada do Creative

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  try {
    const { cliente, mes, ano, campaignsData, capaData } = req.body;

    // ── Auth via OAuth ────────────────────────────────────────
    if (!process.env.GOOGLE_REFRESH_TOKEN) {
      return res.status(500).json({
        success: false,
        error: 'GOOGLE_REFRESH_TOKEN não configurado. Acesse /api/oauth-authorize primeiro.',
      });
    }

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_OAUTH_CLIENT_ID,
      process.env.GOOGLE_OAUTH_CLIENT_SECRET,
      process.env.GOOGLE_OAUTH_REDIRECT_URI
    );

    oauth2Client.setCredentials({
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
    });

    const drive = google.drive({ version: 'v3', auth: oauth2Client });

    // ── Monta conteúdo ─────────────────────────────────────────
    const novoNome = ['Relatório', cliente, mes, ano].filter(Boolean).join(' - ');
    const fb = (capaData && capaData.fb) || {};
    const ig = (capaData && capaData.ig) || {};
    const titulo = [cliente, mes, ano].filter(Boolean).join(' - ');

    const cabecalho = [
      'Nome da Ação', 'Formato', 'Validade', 'Investimento', 'Valor Gasto',
      'Alcance', 'Engajamento', 'Cliques no Link', 'Visualização (ThruPlay)',
      'Custo por 1.000 Pessoas', 'Custo por Cliques no Link', 'Custo por ThruPlay',
      'Custo por Interação', 'Custo por Conversa', 'Filtro', 'Cidade', 'Conversas Iniciadas'
    ];

    const fmt = v => (typeof v === 'number' && v > 0) ? v : '';

    const linhas = (campaignsData || []).map(r => {
      const o = r.objective;
      const isEF = /panfleto|carrossel|virtual|tabloide|post/i.test(r.format || '');
      return [
        r.name, r.format, r.validity || '',
        fmt(r.budget), fmt(r.spent),
        (o === 'Alcance' || o === 'Reels') ? fmt(r.reach) : '',
        (o === 'Engajamento' && isEF) ? fmt(r.eng) : '',
        (o === 'EngLink' || o === 'ConvLink') ? fmt(r.links) : '',
        o === 'Reels' ? fmt(r.views) : '',
        o === 'Alcance' ? fmt(r.cpm) : '',
        (o === 'EngLink' || o === 'ConvLink') ? fmt(r.cpc) : '',
        o === 'Reels' ? fmt(r.cThru) : '',
        (o === 'Engajamento' && isEF) ? fmt(r.cInt) : '',
        o === 'Conversas' ? fmt(r.cConv) : '',
        '', '',
        o === 'Conversas' ? fmt(r.conv) : '',
      ];
    });

    const csvEscape = v => {
      const s = String(v == null ? '' : v);
      return /[,"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };

    const csvRelatorio = [cabecalho, ...linhas]
      .map(row => row.map(csvEscape).join(','))
      .join('\n');

    // ── Upload como Google Sheets na pasta do Creative ────────
    const uploadRelatorio = await drive.files.create({
      requestBody: {
        name: novoNome,
        mimeType: 'application/vnd.google-apps.spreadsheet',
        parents: [FOLDER_ID],
      },
      media: {
        mimeType: 'text/csv',
        body: csvRelatorio,
      },
      fields: 'id, webViewLink',
    });

    const spreadsheetId = uploadRelatorio.data.id;
    const url = uploadRelatorio.data.webViewLink
      || `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;

    // ── (opcional) também cria uma aba "Capa" com os dados da capa ──
    // Como o upload cria só 1 aba, a gente usa Sheets API pra adicionar outra aba:
    try {
      const sheets = google.sheets({ version: 'v4', auth: oauth2Client });

      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [
            { addSheet: { properties: { title: 'Capa', index: 0 } } },
          ],
        },
      });

      const capaValues = [
        ['titulo', titulo],
        ['fb_seguidores', fb.seguidores || ''],
        ['fb_seg_anterior', fb.segAnterior || ''],
        ['fb_homens', fb.homens || ''],
        ['fb_mulheres', fb.mulheres || ''],
        ['fb_faixa', fb.faixa || ''],
        ['fb_alcancadas', fb.alcancadas || ''],
        ['fb_visitas', fb.visitas || ''],
        ['ig_seguidores', ig.seguidores || ''],
        ['ig_seg_anterior', ig.segAnterior || ''],
        ['ig_homens', ig.homens || ''],
        ['ig_mulheres', ig.mulheres || ''],
        ['ig_faixa', ig.faixa || ''],
        ['ig_alcancadas', ig.alcancadas || ''],
        ['ig_visitas', ig.visitas || ''],
      ];

      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: 'Capa!A1',
        valueInputOption: 'RAW',
        requestBody: { values: capaValues },
      });
    } catch (errCapa) {
      console.warn('Aviso: falhou ao criar aba Capa (relatório principal já criado):', errCapa.message);
    }

    return res.status(200).json({ success: true, url, spreadsheetId });
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
