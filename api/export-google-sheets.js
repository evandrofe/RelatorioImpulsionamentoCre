// Versão OAuth com logs detalhados pra debug.

const { google } = require('googleapis');
const { Readable } = require('stream');

const OUTPUT_FOLDER_ID = '1df1RnmflydB0D7ToThnvh63KAhnYxObo';

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  // Helper para loggar de forma estruturada
  const log = (step, data) => console.log(`[DEBUG] ${step}:`, JSON.stringify(data));
  const logErr = (step, err) => console.error(`[DEBUG-ERROR] ${step}:`, JSON.stringify({
    message: err.message,
    code: err.code,
    status: err.status,
    errors: err.errors,
    response_status: err.response && err.response.status,
    response_data: err.response && err.response.data,
  }));

  try {
    const { cliente, mes, ano, campaignsData, capaData } = req.body;

    log('1-env-check', {
      hasRefreshToken: !!process.env.GOOGLE_REFRESH_TOKEN,
      refreshTokenPrefix: process.env.GOOGLE_REFRESH_TOKEN
        ? process.env.GOOGLE_REFRESH_TOKEN.substring(0, 10) + '...'
        : 'MISSING',
      templateId: process.env.GOOGLE_SHEETS_TEMPLATE_ID,
      hasClientId: !!process.env.GOOGLE_OAUTH_CLIENT_ID,
      hasClientSecret: !!process.env.GOOGLE_OAUTH_CLIENT_SECRET,
      redirectUri: process.env.GOOGLE_OAUTH_REDIRECT_URI,
    });

    if (!process.env.GOOGLE_REFRESH_TOKEN) {
      return res.status(500).json({ success: false, error: 'GOOGLE_REFRESH_TOKEN não configurado.' });
    }

    const TEMPLATE_ID = process.env.GOOGLE_SHEETS_TEMPLATE_ID;
    if (!TEMPLATE_ID) {
      return res.status(500).json({ success: false, error: 'GOOGLE_SHEETS_TEMPLATE_ID não configurado.' });
    }

    // ── Auth ──────────────────────────────────────────────────
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_OAUTH_CLIENT_ID,
      process.env.GOOGLE_OAUTH_CLIENT_SECRET,
      process.env.GOOGLE_OAUTH_REDIRECT_URI
    );
    oauth2Client.setCredentials({
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
    });

    // Testa a autenticação pegando o userinfo
    try {
      const tokenResponse = await oauth2Client.getAccessToken();
      log('2-token-obtained', {
        hasToken: !!tokenResponse.token,
        tokenPrefix: tokenResponse.token ? tokenResponse.token.substring(0, 15) + '...' : 'NONE',
      });

      // Descobre qual conta tá logada
      const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
      const userinfo = await oauth2.userinfo.get();
      log('3-userinfo', {
        email: userinfo.data.email,
        verified: userinfo.data.verified_email,
      });
    } catch (err) {
      logErr('2-token-or-userinfo', err);
      return res.status(500).json({
        success: false,
        error: 'Falha na autenticação OAuth: ' + err.message,
      });
    }

    const drive = google.drive({ version: 'v3', auth: oauth2Client });
    const sheets = google.sheets({ version: 'v4', auth: oauth2Client });

    const novoNome = ['Relatório', cliente, mes, ano].filter(Boolean).join(' - ');
    const titulo = [cliente, mes, ano].filter(Boolean).join(' - ').toUpperCase();
    const fb = (capaData && capaData.fb) || {};
    const ig = (capaData && capaData.ig) || {};

    // ── Tenta acessar o template ──────────────────────────────
    let templateMeta;
    try {
      templateMeta = await drive.files.get({
        fileId: TEMPLATE_ID,
        fields: 'id, mimeType, name, owners, trashed',
      });
      log('4-template-found', {
        id: templateMeta.data.id,
        name: templateMeta.data.name,
        mimeType: templateMeta.data.mimeType,
        owners: templateMeta.data.owners && templateMeta.data.owners.map(o => o.emailAddress),
        trashed: templateMeta.data.trashed,
      });
    } catch (err) {
      logErr('4-template-get', err);
      return res.status(500).json({
        success: false,
        error: `Erro ao acessar template (${TEMPLATE_ID}): ${err.message}`,
      });
    }

    // ── Tenta acessar a pasta de saída ────────────────────────
    try {
      const folderMeta = await drive.files.get({
        fileId: OUTPUT_FOLDER_ID,
        fields: 'id, name, owners, mimeType',
      });
      log('5-folder-found', {
        id: folderMeta.data.id,
        name: folderMeta.data.name,
        owners: folderMeta.data.owners && folderMeta.data.owners.map(o => o.emailAddress),
      });
    } catch (err) {
      logErr('5-folder-get', err);
      return res.status(500).json({
        success: false,
        error: `Erro ao acessar pasta de saída (${OUTPUT_FOLDER_ID}): ${err.message}`,
      });
    }

    // ── Copiar o template ─────────────────────────────────────
    let spreadsheetId;
    try {
      if (templateMeta.data.mimeType === 'application/vnd.google-apps.spreadsheet') {
        const copied = await drive.files.copy({
          fileId: TEMPLATE_ID,
          requestBody: {
            name: novoNome,
            parents: [OUTPUT_FOLDER_ID],
          },
          fields: 'id',
        });
        spreadsheetId = copied.data.id;
        log('6-copied', { spreadsheetId });
      } else {
        const xlsxBuffer = await drive.files.get(
          { fileId: TEMPLATE_ID, alt: 'media' },
          { responseType: 'arraybuffer' }
        );
        const buf = Buffer.from(xlsxBuffer.data);
        const stream = Readable.from(buf);

        const uploaded = await drive.files.create({
          requestBody: {
            name: novoNome,
            mimeType: 'application/vnd.google-apps.spreadsheet',
            parents: [OUTPUT_FOLDER_ID],
          },
          media: {
            mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            body: stream,
          },
          fields: 'id',
        });
        spreadsheetId = uploaded.data.id;
        log('6-uploaded-xlsx', { spreadsheetId });
      }
    } catch (err) {
      logErr('6-copy', err);
      return res.status(500).json({
        success: false,
        error: `Erro ao copiar template: ${err.message}`,
      });
    }

    // ── Preencher Capa ────────────────────────────────────────
    const pct = v => {
      const s = String(v || '').trim();
      if (!s) return '';
      return s.endsWith('%') ? s : s + '%';
    };

    const capaUpdates = [
      { range: 'Capa!C2', values: [[titulo]] },
      { range: 'Capa!E12', values: [[fb.seguidores || '']] },
      { range: 'Capa!C15', values: [[fb.segAnterior ? `${fb.segAnterior} seguidores no mês anterior` : '']] },
      { range: 'Capa!E18', values: [[fb.homens ? `👨 ${pct(fb.homens)} Homens` : '']] },
      { range: 'Capa!E23', values: [[fb.mulheres ? `👩 ${pct(fb.mulheres)} Mulheres` : '']] },
      { range: 'Capa!B33', values: [[fb.faixa || '']] },
      { range: 'Capa!D33', values: [[fb.alcancadas || '']] },
      { range: 'Capa!G33', values: [[fb.visitas || '']] },
      { range: 'Capa!N12', values: [[ig.seguidores || '']] },
      { range: 'Capa!L15', values: [[ig.segAnterior ? `${ig.segAnterior} seguidores no mês anterior` : '']] },
      { range: 'Capa!N18', values: [[ig.homens ? `👨 ${pct(ig.homens)} Homens` : '']] },
      { range: 'Capa!N23', values: [[ig.mulheres ? `👩 ${pct(ig.mulheres)} Mulheres` : '']] },
      { range: 'Capa!K33', values: [[ig.faixa || '']] },
      { range: 'Capa!M33', values: [[ig.alcancadas || '']] },
      { range: 'Capa!P33', values: [[ig.visitas || '']] },
    ];

    try {
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId,
        requestBody: {
          valueInputOption: 'USER_ENTERED',
          data: capaUpdates,
        },
      });
      log('7-capa-filled', { cells: capaUpdates.length });
    } catch (err) {
      logErr('7-capa', err);
      // não falha, continua
    }

    // ── Preencher Relatório ───────────────────────────────────
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

    const valoresRelatorio = [cabecalho, ...linhas];

    try {
      await sheets.spreadsheets.values.clear({
        spreadsheetId,
        range: 'Relatório!A1:Q1000',
      });

      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: 'Relatório!A1',
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: valoresRelatorio },
      });
      log('8-relatorio-filled', { rows: valoresRelatorio.length });
    } catch (err) {
      logErr('8-relatorio', err);
    }

    const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;
    log('9-done', { url });
    return res.status(200).json({ success: true, url, spreadsheetId });

  } catch (err) {
    logErr('FATAL', err);
    return res.status(500).json({ success: false, error: err.message });
  }
};
