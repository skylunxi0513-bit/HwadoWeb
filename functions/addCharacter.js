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
    // Use toLocaleString to get date parts in the correct timezone.
    const kstDate = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));

    const year = kstDate.getFullYear();
    const month = kstDate.getMonth() + 1;
    const day = kstDate.getDate();
    const hour = kstDate.getHours();
    const minute = kstDate.getMinutes();
    const second = kstDate.getSeconds();

    const ampm = hour < 12 ? '오전' : '오후';
    const displayHour = hour % 12 === 0 ? 12 : hour % 12;

    const datePart = `${year}. ${month}. ${day}.`;
    const timePart = `${ampm} ${displayHour}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}`;

    return `${datePart} ${timePart}`;
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

    // 1. Fetch Character ID from Neople API
    const serverId = SERVER_MAP[server];
    if (!serverId) {
        return { statusCode: 400, body: JSON.stringify({ message: '유효하지 않은 서버 이름입니다.' }) };
    }

    const neopleUrl = `https://api.neople.co.kr/df/servers/${serverId}/characters?characterName=${encodeURIComponent(nickname)}&apikey=${API_KEY}`;
    const neopleResponse = await fetch(neopleUrl);
    
    if (!neopleResponse.ok) {
        throw new Error('Neople API 호출에 실패했습니다.');
    }

    const neopleData = await neopleResponse.json();
    if (!neopleData.rows || neopleData.rows.length === 0) {
        return { statusCode: 404, body: JSON.stringify({ message: 'Neople API에서 해당 캐릭터를 찾을 수 없습니다.' }) };
    }
    const characterId = neopleData.rows[0].characterId;

    // 2. Fetch Adventure and Guild Name from Timeline API
    const timelineUrl = `https://api.neople.co.kr/df/servers/${serverId}/characters/${characterId}/timeline?limit=1&apikey=${API_KEY}`;
    const timelineResponse = await fetch(timelineUrl);
    if (!timelineResponse.ok) {
        throw new Error('Neople 타임라인 API 호출에 실패했습니다.');
    }
    const timelineData = await timelineResponse.json();
    const adventureName = timelineData.adventureName || '-';
    const guildName = timelineData.guildName || '-';

    // 3. Prepare Google Sheets authentication
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

    // 4. Check for duplicates
    const existingData = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${sheetName}!A:B` });
    const rows = existingData.data.values || [];
    const isDuplicate = rows.some(row => row[0] === server && row[1] && row[1].toLowerCase() === nickname.toLowerCase());

    if (isDuplicate) {
      return { statusCode: 409, body: JSON.stringify({ message: '이미 등록된 캐릭터입니다.' }) };
    }

    // 5. Append data to the sheet
    const timestamp = getKstTimestamp();
    const valuesToAppend = [[server, nickname, characterId, timestamp, timestamp, adventureName, guildName]];

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${sheetName}!A:G`,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      resource: { values: valuesToAppend }
    });

    // 6. Return success response
    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ 
          message: '캐릭터가 성공적으로 추가되었습니다.', 
          added: { server, nickname, timestamp, adventureName, guildName } 
      })
    };

  } catch (error) {
    console.error('Error processing character submission:', error);
    return { statusCode: 500, body: JSON.stringify({ message: error.message || 'Failed to process request.' }) };
  }
};