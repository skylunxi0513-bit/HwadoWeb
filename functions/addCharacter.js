const { google } = require('googleapis');

exports.handler = async function(event, context) {
  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { server, nickname } = JSON.parse(event.body);

    // 1. Validate incoming data
    if (!server || !nickname) {
        return {
            statusCode: 400, // Bad Request
            body: JSON.stringify({ error: 'Missing required character data.' })
        };
    }

    // 2. Prepare Google Sheets authentication
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
    const sheetName = '캐릭터';

    // 3. Check for duplicates
    const existingData = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetName}!A:B`,
    });

    const rows = existingData.data.values || [];
    const isDuplicate = rows.some(row => row[0] === server && row[1] && row[1].toLowerCase() === nickname.toLowerCase());

    if (isDuplicate) {
      return {
        statusCode: 409, // Conflict
        body: JSON.stringify({ message: '이미 등록된 캐릭터입니다.' })
      };
    }

    // 4. Append data to the sheet (Server, Nickname)
    const response = await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${sheetName}!A:B`,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      resource: {
        values: [
          [server, nickname] // The data to append
        ]
      }
    });

    // 5. Return success response
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ message: '캐릭터가 성공적으로 추가되었습니다.', added: { server, nickname } })
    };

  } catch (error) {
    console.error('Error processing character submission:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message || 'Failed to process request.' })
    };
  }
};
