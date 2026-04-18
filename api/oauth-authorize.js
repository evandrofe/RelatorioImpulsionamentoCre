// Rota que inicia o fluxo OAuth.
// Acesse UMA VEZ: https://relatorio-impulsionamento-cre.vercel.app/api/oauth-authorize
// Ela redireciona você pro Google, você faz login e autoriza o app.

const { google } = require('googleapis');

module.exports = async function handler(req, res) {
  try {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_OAUTH_CLIENT_ID,
      process.env.GOOGLE_OAUTH_CLIENT_SECRET,
      process.env.GOOGLE_OAUTH_REDIRECT_URI
    );

    const scopes = [
      'https://www.googleapis.com/auth/drive.file',
      'https://www.googleapis.com/auth/spreadsheets',
    ];

    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',      // indispensável pra vir refresh_token
      prompt: 'consent',           // força o Google a sempre mandar refresh_token
      scope: scopes,
      include_granted_scopes: true,
    });

    res.writeHead(302, { Location: authUrl });
    res.end();
  } catch (err) {
    console.error('Erro no oauth-authorize:', err);
    res.status(500).json({ error: err.message });
  }
};
