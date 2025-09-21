const { google } = require('googleapis');
const fetch = require('node-fetch');

const API_KEY = 'gvn930ycSXuc3OpEcHhWsUx1Ka9El1X5';
const SERVER_MAP = {
    '카인': 'cain', '디레지에': 'diregie', '시로코': 'siroco', '프레이': 'prey',
    '카시야스': 'casillas', '힐더': 'hilder', '안톤': 'anton', '바칼': 'bakal',
};

const FUSION_SET_PREFIXES = ['황금', '용투', '정화', '행운', '돌파', '자연', '전장', '영원', '사냥', '영역', '암영', '영혼'];
const FUSION_UNIQUE_PREFIXES = ['욕망', '배신', '기품', '테아나', '무지', '창조', '축복', '설계'];
const P_COLUMN_SLOTS = ['SHOULDER', 'JACKET', 'PANTS', 'WAIST', 'SHOES'];
const Q_COLUMN_SLOTS = ['WRIST', 'AMULET', 'RING', 'SUPPORT', 'EARRING', 'MAGIC_STON'];

function getFusionStoneCategory(itemName, itemRarity) {
    const prefix = itemName.split(' : ')[0];
    let type = '기타';
    if (FUSION_SET_PREFIXES.includes(prefix)) type = '세트';
    else if (FUSION_UNIQUE_PREFIXES.includes(prefix)) type = '고유';
    return type === '기타' ? '기타' : `${type} ${itemRarity}`;
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
    return `${year}. ${month}. ${day}. ${ampm} ${displayHour}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}`;
}

async function getCharacterCreationDate(serverId, characterId, apiKey) {
    const url = `https://api.neople.co.kr/df/servers/${serverId}/characters/${characterId}/timeline?code=101&limit=1&apikey=${apiKey}`;
    try {
        const response = await fetch(url);
        if (!response.ok) return null;
        const data = await response.json();
        if (data.timeline && data.timeline.rows.length > 0) {
            const creationDate = new Date(data.timeline.rows[0].date);
            const kstDate = new Date(creationDate.toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
            return `${kstDate.getFullYear()}. ${kstDate.getMonth() + 1}. ${kstDate.getDate()}.`;
        }
    } catch (error) {
        console.error(`Failed to get creation date for ${characterId}:`, error);
    }
    return null;
}

function parseDate(dateString) {
    if (!dateString) return null;
    const match = dateString.match(/(\d{4}). (\d{1,2}). (\d{1,2}). (오전|오후) (\d{1,2}):(\d{2}):(\d{2})/);
    if (!match) return null;
    let [, year, month, day, ampm, hour, minute, second] = match;
    hour = parseInt(hour, 10);
    if (ampm === '오후' && hour !== 12) hour += 12;
    if (ampm === '오전' && hour === 12) hour = 0;
    return new Date(year, month - 1, day, hour, minute, second);
}

exports.handler = async function(event, context) {
    console.log('Starting auto-refresh scheduled function...');
    try {
        const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
        if (!privateKey) throw new Error('Service account key not found.');
        const credentials = JSON.parse(privateKey);
        const auth = new google.auth.JWT(credentials.client_email, null, credentials.private_key.replace(/\n/g, '\n'), ['https://www.googleapis.com/auth/spreadsheets']);
        const sheets = google.sheets({ version: 'v4', auth });
        const spreadsheetId = '1H5Hb_zXA9A34XtkScIovnTNAMFXwHQc_fCPqQfB_ALQ';
        const sheetName = '캐릭터';

        const existingData = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${sheetName}!A:E` });
        const rows = existingData.data.values || [];
        console.log(`Found ${rows.length} total rows in the sheet.`);

        if (rows.length <= 1) {
            console.log('No character data to refresh.');
            return { statusCode: 200, body: 'No data.' };
        }

        const characterRows = rows.slice(1); // Exclude header row

        console.log('Parsing timestamps for all characters...');
        const oldestCharInfo = characterRows
            .map((row, index) => {
                const charInfo = {
                    server: row[0],
                    nickname: row[1],
                    timestamp: row[4], // Column E
                    date: parseDate(row[4]),
                    rowIndex: index + 2 // Sheet row index (1-based + 1 for header)
                };
                console.log(`  - Nickname: ${charInfo.nickname}, Timestamp: \'${charInfo.timestamp}\', Parsed Date: ${charInfo.date}`);
                return charInfo;
            })
            .filter(char => char.date) // Filter out any characters where date parsing failed
            .sort((a, b) => a.date - b.date)[0]; // Sort by date ascending and pick the first one

        if (!oldestCharInfo) {
            console.log('Could not find a valid character to refresh. All characters might have invalid timestamps.');
            return { statusCode: 200, body: 'No valid character to refresh.' };
        }

        console.log(`Identified oldest character: ${oldestCharInfo.nickname} (Row: ${oldestCharInfo.rowIndex})`);

        const { server, nickname, rowIndex: oldestRowIndex } = oldestCharInfo;
        
        console.log(`Oldest character found: ${nickname} on server ${server}. Refreshing...`);
        const serverId = SERVER_MAP[server];
        if (!serverId) throw new Error(`Invalid server name: ${server}`);

        const charInfoUrl = `https://api.neople.co.kr/df/servers/${serverId}/characters?characterName=${encodeURIComponent(nickname)}&apikey=${API_KEY}`;
        const charInfoResponse = await fetch(charInfoUrl);
        if (!charInfoResponse.ok) throw new Error('Neople 캐릭터 정보 API 호출 실패');
        const charInfoData = await charInfoResponse.json();
        if (!charInfoData.rows || charInfoData.rows.length === 0) throw new Error('Neople API에서 해당 캐릭터를 찾을 수 없습니다.');
        
        const characterId = charInfoData.rows[0].characterId;
        const newJobGrowName = charInfoData.rows[0].jobGrowName;
        const newCharacterCreationDate = await getCharacterCreationDate(serverId, characterId, API_KEY);

        const [timelineRes, statusRes, equipRes] = await Promise.all([
            fetch(`https://api.neople.co.kr/df/servers/${serverId}/characters/${characterId}/timeline?limit=1&apikey=${API_KEY}`),
            fetch(`https://api.neople.co.kr/df/servers/${serverId}/characters/${characterId}/status?apikey=${API_KEY}`),
            fetch(`https://api.neople.co.kr/df/servers/${serverId}/characters/${characterId}/equip/equipment?apikey=${API_KEY}`)
        ]);
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

        const nonWeaponEquipsFiltered = equipData.equipment.filter(e => e.slotId !== 'WEAPON' && e.slotId !== 'TITLE' && e.slotId !== 'SUPPORT_WEAPON');
        const rarityCounts = {'태초':0,'에픽':0,'레전더리':0,'유니크':0,'레어':0};
        nonWeaponEquipsFiltered.forEach(e => { if(rarityCounts.hasOwnProperty(e.itemRarity)) rarityCounts[e.itemRarity]++; });
        const formattedRaritySummary = Object.entries(rarityCounts).filter(([,count])=>count>0).map(([rarity,count])=>`${rarity}${count}`).join(' ');

        const pColumnFusionCounts = [0,0,0,0,0], qColumnFusionCounts = [0,0,0,0,0];
        equipData.equipment.forEach(e => {
            if (e.upgradeInfo?.itemName) {
                const category = getFusionStoneCategory(e.upgradeInfo.itemName, e.upgradeInfo.itemRarity);
                const targetCounts = P_COLUMN_SLOTS.includes(e.slotId) ? pColumnFusionCounts : Q_COLUMN_SLOTS.includes(e.slotId) ? qColumnFusionCounts : null;
                if(targetCounts) {
                    if (category === '고유 에픽') targetCounts[0]++; else if (category === '세트 에픽') targetCounts[1]++;
                    else if (category === '고유 유니크') targetCounts[2]++; else if (category === '세트 유니크') targetCounts[3]++;
                    else if (category === '기타') targetCounts[4]++;
                }
            }
        });
        const formattedPColumnFusionSummary = pColumnFusionCounts.join(' ');
        const formattedQColumnFusionSummary = qColumnFusionCounts.join(' ');

        let totalReinforceAmp = 0, itemCountForAverage = 0;
        nonWeaponEquipsFiltered.forEach(e => {
            totalReinforceAmp += ((e.amplification || 0) > 0 ? (e.amplification || 0) : (e.reinforce || 0));
            itemCountForAverage++;
        });
        if (amplificationName) {
            totalReinforceAmp += (reinforce || 0);
            itemCountForAverage++;
        }
        const averageReinforceAmp = itemCountForAverage > 0 ? (totalReinforceAmp / itemCountForAverage).toFixed(2) : '0.00';

        const newRefreshTimestamp = getKstTimestamp();
        const originalRegisterDate = rows[oldestRowIndex - 1][3] || '';
        const updateRange = `${sheetName}!C${oldestRowIndex}:S${oldestRowIndex}`;
        const valuesToUpdate = [[characterId, originalRegisterDate, newRefreshTimestamp, newAdventureName, newGuildName, newFame, newWeaponName, newWeaponRarity, newReinforceValue, newAmplificationValue, refine, formattedRaritySummary, averageReinforceAmp, formattedPColumnFusionSummary, formattedQColumnFusionSummary, newJobGrowName, newCharacterCreationDate]];
        
        await sheets.spreadsheets.values.update({ spreadsheetId, range: updateRange, valueInputOption: 'USER_ENTERED', resource: { values: valuesToUpdate } });

        console.log(`Successfully refreshed and updated ${nickname} in the sheet.`);
        return { statusCode: 200, body: JSON.stringify({ message: `Successfully refreshed ${nickname}` }) };

    } catch (error) {
        console.error('Error in auto-refresh function:', error);
        return { statusCode: 500, body: JSON.stringify({ message: error.message || 'Failed to process request.' }) };
    }
};
