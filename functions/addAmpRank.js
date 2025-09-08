const { google } = require('googleapis');

// The secret password for rank submission, assumed to be the same
const SHARED_PASSWORD = process.env.RANKING_PASSWORD || '0305';

exports.handler = async function(event, context) {
  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { nickname, level, gold, crystals, password } = JSON.parse(event.body);

    // 1. Validate password
    if (password !== SHARED_PASSWORD) {
      return {
        statusCode: 401, // Unauthorized
        body: JSON.stringify({ error: 'Invalid password.' })
      };
    }

    // 2. Validate incoming data
    if (!nickname || typeof level === 'undefined' || typeof gold === 'undefined' || typeof crystals === 'undefined') {
        return {
            statusCode: 400, // Bad Request
            body: JSON.stringify({ error: 'Missing required ranking data for amplification.' })
        };
    }

    // 3. Prepare Google Sheets authentication
    const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
    if (!privateKey) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Service account key not found.' })
      };
    }
    const credentials = JSON.parse(privateKey);
    const auth = new google.auth.JWT(
      credentials.client_email,
      null,
      credentials.private_key.replace(/\\n/g, '\n'),
      ['https://www.googleapis.com/auth/spreadsheets'] // Use read-write scope
    );

    const sheets = google.sheets({ version: 'v4', auth });
    const spreadsheetId = '1H5Hb_zXA9A34XtkScIovnTNAMFXwHQc_fCPqQfB_ALQ';
    const sheetName = '증폭랭킹'; // Target the '증폭랭킹' sheet

    // 4. Append data to the sheet (Nickname, Level, Gold, Crystals)
    const response = await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${sheetName}!A:D`, // Write to columns A, B, C, D
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      resource: {
        values: [
          [nickname, level, gold, crystals] // The data to append
        ]
      }
    });

    // 5. Return success response
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ message: 'Amplification ranking submitted successfully!', updatedRange: response.data.updates.updatedRange })
    };

  } catch (error) {
    console.error('Error processing amplification rank submission:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message || 'Failed to submit amplification ranking.' })
    };
  }
};
