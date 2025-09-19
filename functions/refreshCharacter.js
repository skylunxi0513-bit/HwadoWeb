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

    // 1. Prepare Google Sheets auth
    const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
    if (!privateKey) return { statusCode: 500, body: JSON.stringify({ message: 'Service account key not found.' }) };
    const credentials = JSON.parse(privateKey);
    const auth = new google.auth.JWT(credentials.client_email, null, credentials.private_key.replace(/\n/g, '\n'), ['https://www.googleapis.com/auth/spreadsheets']);
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
    const sheetRowIndex = rowIndex + 1;
    const originalRegisterDate = rows[rowIndex][3] || '';

    // 3. Fetch all Neople API data in parallel
    const charInfoUrl = `https://api.neople.co.kr/df/servers/${serverId}/characters?characterName=${encodeURIComponent(nickname)}&apikey=${API_KEY}`;
    const charInfoResponse = await fetch(charInfoUrl);
    if (!charInfoResponse.ok) throw new Error('Neople 캐릭터 정보 API 호출 실패');
    const charInfoData = await charInfoResponse.json();
    if (!charInfoData.rows || charInfoData.rows.length === 0) {
        return { statusCode: 404, body: JSON.stringify({ message: 'Neople API에서 해당 캐릭터를 찾을 수 없습니다.' }) };
    }
    const characterId = charInfoData.rows[0].characterId;

    const timelineUrl = `https://api.neople.co.kr/df/servers/${serverId}/characters/${characterId}/timeline?limit=1&apikey=${API_KEY}`;
    const statusUrl = `https://api.neople.co.kr/df/servers/${serverId}/characters/${characterId}/status?apikey=${API_KEY}`;
    const equipUrl = `https://api.neople.co.kr/df/servers/${serverId}/characters/${characterId}/equip/equipment?apikey=${API_KEY}`;

    const [timelineRes, statusRes, equipRes] = await Promise.all([fetch(timelineUrl), fetch(statusUrl), fetch(equipUrl)]);
    if (!timelineRes.ok || !statusRes.ok || !equipRes.ok) throw new Error('Neople API 병렬 호출 실패');

    const timelineData = await timelineRes.json();
    const statusData = await statusRes.json();
    const equipData = await equipRes.json();

    const newAdventureName = timelineData.adventureName || '-';
    const newGuildName = timelineData.guildName || '-';
    const newFame = statusData.status.find(s => s.name === '모험가 명성')?.value || 0;

    const weapon = equipData.equipment.find(e => e.slotId === 'WEAPON');
    const newWeaponName = weapon?.itemName || 'N/A';
    const newWeaponRarity = weapon?.itemRarity || 'N/A';
    const reinforce = weapon?.reinforce || 0;
    const refine = weapon?.refine || 0;
    const amplificationName = weapon?.amplificationName;
    const newAmplificationValue = amplificationName ? reinforce : 0;
    const newReinforceValue = amplificationName ? 0 : reinforce;

    // --- New Logic: Process 11 non-weapon equipment slots ---
    const nonWeaponEquips = equipData.equipment.filter(e => e.slotId !== 'WEAPON' && e.slotId !== 'TITLE');

    const rarityCounts = {
        '태초': 0,
        '에픽': 0,
        '레전더리': 0,
        '유니크': 0,
        '레어': 0,
    };

    nonWeaponEquips.forEach(equip => {
        const rarity = equip.itemRarity;
        if (rarityCounts.hasOwnProperty(rarity)) {
            rarityCounts[rarity]++;
        }
    });

    let raritySummary = [];
    if (rarityCounts['태초'] > 0) raritySummary.push(`태초${rarityCounts['태초']}`);
    if (rarityCounts['에픽'] > 0) raritySummary.push(`에픽${rarityCounts['에픽']}`);
    if (rarityCounts['레전더리'] > 0) raritySummary.push(`레전더리${rarityCounts['레전더리']}`);
    if (rarityCounts['유니크'] > 0) raritySummary.push(`유니크${rarityCounts['유니크']}`);
    if (rarityCounts['레어'] > 0) raritySummary.push(`레어${rarityCounts['레어']}`);

    const formattedRaritySummary = raritySummary.join(' ');
    // --- End New Logic (Rarity Summary) ---

    // --- New Logic: Calculate Average Reinforce/Amplification ---
    let totalReinforceAmp = 0;
    let itemCountForAverage = 0;

    // Add non-weapon equips
    nonWeaponEquips.forEach(equip => {
        const equipReinforce = equip.reinforce || 0;
        const equipAmplification = equip.amplification || 0;
        totalReinforceAmp += (equipAmplification > 0 ? equipAmplification : equipReinforce);
        itemCountForAverage++;
    });

    // Add weapon if it's an amplification weapon
    const isWeaponAmplified = amplificationName; // Use amplificationName which is already extracted
    if (isWeaponAmplified) {
        totalReinforceAmp += (reinforce || 0); // Use reinforce which is already extracted
        itemCountForAverage++;
    }

    const averageReinforceAmp = itemCountForAverage > 0 ? Math.round(totalReinforceAmp / itemCountForAverage) : 0;
    // --- End New Logic (Average) ---

    // 5. Update the sheet
    const newRefreshTimestamp = getKstTimestamp();
    const updateRange = `${sheetName}!C${sheetRowIndex}:O${sheetRowIndex}`;
    const valuesToUpdate = [[characterId, originalRegisterDate, newRefreshTimestamp, newAdventureName, newGuildName, newFame, newWeaponName, newWeaponRarity, newReinforceValue, newAmplificationValue, refine, formattedRaritySummary, averageReinforceAmp]];

    await sheets.spreadsheets.values.update({ spreadsheetId, range: updateRange, valueInputOption: 'USER_ENTERED', resource: { values: valuesToUpdate } });

    // 6. Return success response
    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ 
          message: '캐릭터 정보가 새로고침되었습니다.', 
          refreshed: { server, nickname, timestamp: newRefreshTimestamp, adventureName: newAdventureName, guildName: newGuildName, fame: newFame, weaponName: newWeaponName, weaponRarity: newWeaponRarity, reinforce: newReinforceValue, amplification: newAmplificationValue, refine: refine, formattedRaritySummary, averageReinforceAmp }
      })
    };

  } catch (error) {
    console.error('Error processing character refresh:', error);
    return { statusCode: 500, body: JSON.stringify({ message: error.message || 'Failed to process request.' }) };
  }
};