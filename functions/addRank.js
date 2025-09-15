const { google } = require('googleapis');

// The secret password for rank submission
const SHARED_PASSWORD = process.env.RANKING_PASSWORD || '0305';

exports.handler = async function(event, context) {
  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { nickname, level, gold, password } = JSON.parse(event.body);

    // 1. Validate password
    if (password !== SHARED_PASSWORD) {
      return {
        statusCode: 401, // Unauthorized
        body: JSON.stringify({ error: 'Invalid password.' })
      };
    }

    // 2. Validate incoming data
    if (!nickname || typeof level === 'undefined' || typeof gold === 'undefined') {
        return {
            statusCode: 400, // Bad Request
            body: JSON.stringify({ error: 'Missing required ranking data.' })
        };
    }

    // Get current timestamp in Korean format (YYYY. MM. DD. 오전/오후 HH:MM:SS)
    const now = new Date();
    const options = {
        year: 'numeric', month: 'numeric', day: 'numeric',
        hour: 'numeric', minute: 'numeric', second: 'numeric',
        hour12: false, // Use 24-hour format first
        timeZone: 'Asia/Seoul'
    };
    let formatted = new Intl.DateTimeFormat('ko-KR', options).format(now);

    // Manual conversion to 오전/오후
    const parts = formatted.split(' ');
    const datePart = parts.slice(0, 3).join('. ') + '.'; // YYYY. MM. DD.
    const timePart = parts[3]; // HH:MM:SS
    const hour = parseInt(timePart.split(':')[0]);
    const ampm = hour < 12 ? '오전' : '오후';
    const displayHour = hour % 12 === 0 ? 12 : hour % 12; // Convert 0 to 12 for AM/PM

    const newTimePart = `${ampm} ${displayHour}:${timePart.split(':')[1]}:${timePart.split(':')[2]}`;
    const timestamp = `${datePart} ${newTimePart}`;

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
    const sheetName = '강화랭킹';

    // 4. Append data to the sheet, including timestamp in D column
    const response = await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${sheetName}!A:D`,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      resource: {
        values: [
          [nickname, level, gold, timestamp] // The data to append
        ]
      }
    });

    // 5. Return success response
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ message: 'Ranking submitted successfully!', updatedRange: response.data.updates.updatedRange })
    };

  } catch (error) {
    console.error('Error processing rank submission:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message || 'Failed to process request.' })
    };
  }
};
