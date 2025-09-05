const { google } = require('googleapis');

exports.handler = async function(event, context) {
  try {
    const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
    const auth = new google.auth.JWT(
      credentials.client_email,
      null,
      credentials.private_key.replace(/\\n/g, '\n'),
      ['https://www.googleapis.com/auth/spreadsheets.readonly']
    );
    const sheets = google.sheets({ version: 'v4', auth });
    const spreadsheetId = '1H5Hb_zXA9A34XtkScIovnTNAMFXwHQc_fCPqQfB_ALQ';

    const queryType = event.queryStringParameters.query;

    // New query type to check ranking for a user
    if (queryType === 'checkRank') {
        const nickname = event.queryStringParameters.nickname;
        if (!nickname) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Nickname is required for checkRank query.' }) };
        }

        const response = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: '강화랭킹!A:B', // Read Nickname and Level columns
        });

        const rows = response.data.values || [];
        const hasAchieved = rows.some(row => row[0] === nickname && parseInt(row[1], 10) >= 12);

        return {
            statusCode: 200,
            headers: { 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({ unlocked: hasAchieved }),
        };
    }

    // Default behavior: fetch sheet data by name
    const sheetName = event.queryStringParameters.sheetName || '스킬코드';
    const filterColumnIndex = event.queryStringParameters.filterColumn ? parseInt(event.queryStringParameters.filterColumn) : null;
    const filterValue = event.queryStringParameters.filterValue || null;

    const range = `${sheetName}!A:F`;
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range,
    });

    let rows = response.data.values;
    if (!rows || rows.length === 0) {
      return {
        statusCode: 200,
        body: JSON.stringify({ message: 'No data found.', data: [] }),
      };
    }

    const headers = rows[0];
    const dataRows = rows.slice(1);

    let filteredData = dataRows;
    if (filterColumnIndex !== null && filterValue !== null) {
      filteredData = dataRows.filter(row => {
        return row[filterColumnIndex] !== undefined && row[filterColumnIndex].trim().toLowerCase() === filterValue.trim().toLowerCase();
      });
    }

    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ headers, data: filteredData }),
    };

  } catch (error) {
    console.error('Error in sheets function:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message || 'Failed to process request.' }),
    };
  }
};