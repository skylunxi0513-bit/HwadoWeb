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

function getKstTimestamp() {
    const now = new Date();
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

    const serverId = SERVER_MAP[server];
    if (!serverId) {
        return { statusCode: 400, body: JSON.stringify({ message: '유효하지 않은 서버 이름입니다.' }) };
    }

    // 1. Fetch Character ID
    const charInfoUrl = `https://api.neople.co.kr/df/servers/${serverId}/characters?characterName=${encodeURIComponent(nickname)}&apikey=${API_KEY}`;
    const charInfoResponse = await fetch(charInfoUrl);
    if (!charInfoResponse.ok) throw new Error('Neople 캐릭터 정보 API 호출 실패');
    const charInfoData = await charInfoResponse.json();
    if (!charInfoData.rows || charInfoData.rows.length === 0) {
        return { statusCode: 404, body: JSON.stringify({ message: 'Neople API에서 해당 캐릭터를 찾을 수 없습니다.' }) };
    }
    const characterId = charInfoData.rows[0].characterId;

    // 2. Fetch Timeline, Status, Equipment data in parallel
    const timelineUrl = `https://api.neople.co.kr/df/servers/${serverId}/characters/${characterId}/timeline?limit=1&apikey=${API_KEY}`;
    const statusUrl = `https://api.neople.co.kr/df/servers/${serverId}/characters/${characterId}/status?apikey=${API_KEY}`;
    const equipUrl = `https://api.neople.co.kr/df/servers/${serverId}/characters/${characterId}/equip/equipment?apikey=${API_KEY}`;

    const [timelineRes, statusRes, equipRes] = await Promise.all([fetch(timelineUrl), fetch(statusUrl), fetch(equipUrl)]);
    if (!timelineRes.ok || !statusRes.ok || !equipRes.ok) throw new Error('Neople API 병렬 호출 실패');

    const timelineData = await timelineRes.json();
    const statusData = await statusRes.json();
    const equipData = await equipRes.json();

    // 3. Extract required data
    const adventureName = timelineData.adventureName || '-';
    const guildName = timelineData.guildName || '-';
    const fame = statusData.status.find(s => s.name === '모험가 명성')?.value || 0;
    
    const weapon = equipData.equipment.find(e => e.slotId === 'WEAPON');
    const weaponName = weapon?.itemName || 'N/A';
    const weaponRarity = weapon?.itemRarity || 'N/A';
    const reinforce = weapon?.reinforce || 0;
    const refine = weapon?.refine || 0;
    const amplificationName = weapon?.amplificationName;
    const amplificationValue = amplificationName ? reinforce : 0;
    const reinforceValue = amplificationName ? 0 : reinforce;

    // 4. Prepare Google Sheets auth
    const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
    if (!privateKey) return { statusCode: 500, body: JSON.stringify({ message: 'Service account key not found.' }) };
    const credentials = JSON.parse(privateKey);
    const auth = new google.auth.JWT(credentials.client_email, null, credentials.private_key.replace(/\n/g, '\n'), ['https://www.googleapis.com/auth/spreadsheets']);
    const sheets = google.sheets({ version: 'v4', auth });
    const spreadsheetId = '1H5Hb_zXA9A34XtkScIovnTNAMFXwHQc_fCPqQfB_ALQ';
    const sheetName = '캐릭터';

    // 5. Check for duplicates
    const existingData = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${sheetName}!A:B` });
    const rows = existingData.data.values || [];
    if (rows.some(r => r[0] === server && r[1] && r[1].toLowerCase() === nickname.toLowerCase())) {
      return { statusCode: 409, body: JSON.stringify({ message: '이미 등록된 캐릭터입니다.' }) };
    }

    // 6. Append data to the sheet
    const timestamp = getKstTimestamp();
    const valuesToAppend = [[server, nickname, characterId, timestamp, timestamp, adventureName, guildName, fame, weaponName, weaponRarity, reinforceValue, amplificationValue, refine]];
    await sheets.spreadsheets.values.append({ spreadsheetId, range: `${sheetName}!A:M`, valueInputOption: 'USER_ENTERED', insertDataOption: 'INSERT_ROWS', resource: { values: valuesToAppend } });

    // 7. Return success response
    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ 
          message: '캐릭터가 성공적으로 추가되었습니다.', 
          added: { server, nickname, timestamp, adventureName, guildName, fame, weaponName, weaponRarity, reinforce: reinforceValue, amplification: amplificationValue, refine }
      })
    };

  } catch (error) {
    console.error('Error processing character submission:', error);
    return { statusCode: 500, body: JSON.stringify({ message: error.message || 'Failed to process request.' }) };
  }
};
