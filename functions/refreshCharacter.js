const { google } = require('googleapis');
const fetch = require('node-fetch');

const API_KEY = 'gvn930ycSXuc3OpEcHhWsUx1Ka9El1X5';
const SERVER_MAP = {
    '카인': 'cain',
    '디레지에': 'diregie',
    '시로코': 'siroco',
    '프레이': 'prey',
    '카시야스': 'casillas',
    '힐더': 'hilder',
    '안톤': 'anton',
    '바칼': 'bakal',
};

// Function to get KST timestamp
function getKstTimestamp() {
    const now = new Date();
    const options = {
        year: 'numeric', month: 'numeric', day: 'numeric',
        hour: 'numeric', minute: 'numeric', second: 'numeric',
        hour12: false, 
        timeZone: 'Asia/Seoul'
    };
    let formatted = new Intl.DateTimeFormat('ko-KR', options).format(now);

    const parts = formatted.split(' ');
    const datePart = parts.slice(0, 3).join('. ') + '.';
    const timePart = parts[3];
    const hour = parseInt(timePart.split(':')[0]);
    const ampm = hour < 12 ? '오전' : '오후';
    const displayHour = hour % 12 === 0 ? 12 : hour % 12;

    const newTimePart = `${ampm} ${displayHour}:${timePart.split(':')[1]}:${timePart.split(':')[2]}`;
    return `${datePart} ${newTimePart}`;
}

exports.handler = async function(event, context) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { server, nickname } = JSON.parse(event.body);

    if (!server || !nickname) {
        return { statusCode: 400, body: JSON.stringify({ message: '서버와 닉네임을 모두 입력해주세요.' }) };
    }

    // 1. Authenticate with Google Sheets
    const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
    if (!privateKey) {
      return { statusCode: 500, body: JSON.stringify({ message: 'Service account key not found.' }) };
    }
    const credentials = JSON.parse(privateKey);
    const auth = new google.auth.JWT(
      credentials.client_email,
      null,
      credentials.private_key.replace(/\\n/g, '\n'),
      ['https://www.googleapis.com/auth/spreadsheets']
    );
    const sheets = google.sheets({ version: 'v4', auth });
    const spreadsheetId = '1H5Hb_zXA9A34XtkScIovnTNAMFXwHQc_fCPqQfB_ALQ';
    const sheetName = '캐릭터';

    // 2. Find the character's row
    const existingData = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${sheetName}!A:D` });
    const rows = existingData.data.values || [];
    const rowIndex = rows.findIndex(row => row[0] === server && row[1] && row[1].toLowerCase() === nickname.toLowerCase());

    if (rowIndex === -1) {
        return { statusCode: 404, body: JSON.stringify({ message: '시트에서 해당 캐릭터를 찾을 수 없습니다.' }) };
    }

    const sheetRowIndex = rowIndex + 1; // 0-based to 1-based index
    const originalRegisterDate = rows[rowIndex][3] || ''; // Get original registration date

    // 3. Fetch new Character ID from Neople API
    const serverId = SERVER_MAP[server];
    const neopleUrl = `https://api.neople.co.kr/df/servers/${serverId}/characters?characterName=${encodeURIComponent(nickname)}&apikey=${API_KEY}`;
    const neopleResponse = await fetch(neopleUrl);
    if (!neopleResponse.ok) {
        throw new Error('Neople API 호출에 실패했습니다.');
    }
    const neopleData = await neopleResponse.json();
    if (!neopleData.rows || neopleData.rows.length === 0) {
        return { statusCode: 404, body: JSON.stringify({ message: 'Neople API에서 해당 캐릭터를 찾을 수 없습니다.' }) };
    }
    const newCharacterId = neopleData.rows[0].characterId;

    // 4. Update the sheet
    const newRefreshTimestamp = getKstTimestamp();
    const updateRange = `${sheetName}!C${sheetRowIndex}:E${sheetRowIndex}`;
    const valuesToUpdate = [[newCharacterId, originalRegisterDate, newRefreshTimestamp]];

    await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: updateRange,
        valueInputOption: 'USER_ENTERED',
        resource: { values: valuesToUpdate }
    });

    // 5. Return success response
    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ 
          message: '캐릭터 정보가 새로고침되었습니다.', 
          refreshed: { server, nickname, timestamp: newRefreshTimestamp } 
      })
    };

  } catch (error) {
    console.error('Error processing character refresh:', error);
    return { statusCode: 500, body: JSON.stringify({ message: error.message || 'Failed to process request.' }) };
  }
};
