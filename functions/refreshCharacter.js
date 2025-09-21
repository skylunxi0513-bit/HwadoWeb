const { google } = require('googleapis');
const fetch = require('node-fetch');

const API_KEY = 'gvn930ycSXuc3OpEcHhWsUx1Ka9El1X5';
const SERVER_MAP = {
    '카인': 'cain', '디레지에': 'diregie', '시로코': 'siroco', '프레이': 'prey',
    '카시야스': 'casillas', '힐더': 'hilder', '안톤': 'anton', '바칼': 'bakal',
};

const BUFFER_JOBS = ['인챈트리스', '크루세이더', '패러메딕', '뮤즈'];

function getRole(jobGrowName) {
    const cleanJobName = (jobGrowName || '').replace('眞 ', '');
    return BUFFER_JOBS.includes(cleanJobName) ? '버퍼' : '딜러';
}

// Constants for fusion stone categorization
const FUSION_SET_PREFIXES = ['황금', '용투', '정화', '행운', '돌파', '자연', '전장', '영원', '사냥', '영역', '암영', '영혼'];
const FUSION_UNIQUE_PREFIXES = ['욕망', '배신', '기품', '테아나', '무지', '창조', '축복', '설계'];

// Constants for equipment slots (P-column and Q-column)
const P_COLUMN_SLOTS = ['SHOULDER', 'JACKET', 'PANTS', 'WAIST', 'SHOES']; // 머리어깨, 상의, 하의, 벨트, 신발
const Q_COLUMN_SLOTS = ['WRIST', 'AMULET', 'RING', 'SUPPORT', 'EARRING', 'MAGIC_STON']; // 팔찌, 목걸이, 반지, 보조장비, 귀걸이, 마법석

/**
 * Categorizes a fusion stone based on its name prefix and rarity.
 * @param {string} itemName - The full name of the fusion stone (e.g., '축복 : 작열하는 태양').
 * @param {string} itemRarity - The rarity of the fusion stone (e.g., '에픽', '유니크').
 * @returns {string} The category string (e.g., '고유 에픽', '세트 유니크', '기타').
 */
function getFusionStoneCategory(itemName, itemRarity) {
    const parts = itemName.split(' : ');
    const prefix = parts.length > 1 ? parts[0] : '';

    let type = '기타';
    if (FUSION_SET_PREFIXES.includes(prefix)) {
        type = '세트';
    } else if (FUSION_UNIQUE_PREFIXES.includes(prefix)) {
        type = '고유';
    }

    if (type === '기타') {
        return '기타';
    } else {
        return `${type} ${itemRarity}`;
    }
}

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

/**
 * Fetches character creation date from Neople API timeline.
 * @param {string} serverId - The server ID (e.g., 'cain').
 * @param {string} characterId - The character ID.
 * @param {string} apiKey - The Neople API key.
 * @returns {Promise<string|null>} The character creation date in 'YYYY. MM. DD.' format (KST), or null if not found.
 */
async function getCharacterCreationDate(serverId, characterId, apiKey) {
    const baseTimelineUrl = `https://api.neople.co.kr/df/servers/${serverId}/characters/${characterId}/timeline`;
    const maxDays = 90; // Max range for one API call

    let earliestCreationDate = null;

    // Helper to format Date to YYYY-MM-DDTHH:MM (KST)
    const formatApiDate = (date) => {
        const kstDate = new Date(date.toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
        const year = kstDate.getFullYear();
        const month = String(kstDate.getMonth() + 1).padStart(2, '0');
        const day = String(kstDate.getDate()).padStart(2, '0');
        const hours = String(kstDate.getHours()).padStart(2, '0');
        const minutes = String(kstDate.getMinutes()).padStart(2, '0');
        return `${year}-${month}-${day}T${hours}:${minutes}`;
    };

    // Start from today and go back in 90-day chunks
    let currentEndDate = new Date(); // Current KST time
    let currentStartDate = new Date(currentEndDate);
    currentStartDate.setDate(currentStartDate.getDate() - maxDays);

    // Define the earliest possible date for DFO timeline data (September 21, 2017)
    const earliestApiDate = new Date('2017-09-21T00:00:00+09:00'); // KST

    while (currentEndDate >= earliestApiDate) {
        let nextCursor = null;
        let hasMoreDataInWindow = true;

        while (hasMoreDataInWindow) {
            let url = `${baseTimelineUrl}?limit=100&apikey=${apiKey}`;
            url += `&startDate=${formatApiDate(currentStartDate)}`;
            url += `&endDate=${formatApiDate(currentEndDate)}`;

            if (nextCursor) {
                url += `&next=${nextCursor}`;
            }

            try {
                const response = await fetch(url);
                if (!response.ok) {
                    console.error(`Failed to fetch timeline data: ${response.status} ${response.statusText}`);
                    // If API returns 404 for very old dates, it means no data. Break the inner loop.
                    if (response.status === 404) {
                        hasMoreDataInWindow = false;
                        break;
                    }
                    throw new Error(`API call failed: ${response.status}`);
                }
                const data = await response.json();

                const rows = data.timeline?.rows || [];

                for (const row of rows) {
                    if (row.code === 101) { // Character creation event
                        const creationDate = new Date(row.date); // Assuming row.date is parseable
                        if (!earliestCreationDate || creationDate < earliestCreationDate) {
                            earliestCreationDate = creationDate;
                        }
                    }
                }

                nextCursor = data.timeline?.next;
                if (!nextCursor) {
                    hasMoreDataInWindow = false;
                }
            } catch (error) {
                console.error(`Error fetching timeline for ${characterId}:`, error);
                hasMoreDataInWindow = false; // Stop trying for this window
            }
        }

        // Move window backward
        currentEndDate = new Date(currentStartDate); // End of new window is start of old window
        currentEndDate.setSeconds(currentEndDate.getSeconds() - 1); // Go back 1 second to avoid overlap
        currentStartDate = new Date(currentEndDate);
        currentStartDate.setDate(currentStartDate.getDate() - maxDays);
    }

    if (earliestCreationDate) {
        // Format to 'YYYY. MM. DD.' KST
        const kstDate = new Date(earliestCreationDate.toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
        const year = kstDate.getFullYear();
        const month = String(kstDate.getMonth() + 1).padStart(2, '0');
        const day = String(kstDate.getDate()).padStart(2, '0');
        return `${year}. ${month}. ${day}.`;
    }
    return null;
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
    const newJobGrowName = charInfoData.rows[0].jobGrowName; // Added jobGrowName
    const newCharacterCreationDate = await getCharacterCreationDate(serverId, characterId, API_KEY); // Added character creation date
    const newRole = getRole(newJobGrowName); // NEW: Determine role

    // 5. Update the sheet
    const newRefreshTimestamp = getKstTimestamp();
    const updateRange = `${sheetName}!C${sheetRowIndex}:T${sheetRowIndex}`; // UPDATED: range to include T column
    const valuesToUpdate = [[characterId, originalRegisterDate, newRefreshTimestamp, newAdventureName, newGuildName, newFame, newWeaponName, newWeaponRarity, newReinforceValue, newAmplificationValue, refine, formattedRaritySummary, averageReinforceAmp, formattedPColumnFusionSummary, formattedQColumnFusionSummary, newJobGrowName, newCharacterCreationDate, newRole]]; // UPDATED: Added newRole

    await sheets.spreadsheets.values.update({ spreadsheetId, range: updateRange, valueInputOption: 'USER_ENTERED', resource: { values: valuesToUpdate } });

    // 6. Return success response
    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ 
          message: '캐릭터 정보가 새로고침되었습니다.', 
          refreshed: { server, nickname, timestamp: newRefreshTimestamp, adventureName: newAdventureName, guildName: newGuildName, fame: newFame, weaponName: newWeaponName, weaponRarity: newWeaponRarity, reinforce: newReinforceValue, amplification: newAmplificationValue, refine: refine, formattedRaritySummary, averageReinforceAmp, formattedPColumnFusionSummary, formattedQColumnFusionSummary, jobGrowName: newJobGrowName, characterCreationDate: newCharacterCreationDate }
      })
    };

  } catch (error) {
    console.error('Error processing character refresh:', error);
    return { statusCode: 500, body: JSON.stringify({ message: error.message || 'Failed to process request.' }) };
  }
};