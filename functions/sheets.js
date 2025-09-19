const { google } = require('googleapis');

// --- Helper Functions ---
function calculateXp(level) {
    if (level < 12) return 0;
    return Math.pow(3, level - 12);
}

// 새로운 증폭 경험치 계산 함수
function calculateAmpXp(level) {
    if (level < 10) return 0;
    if (level === 10) return 1;
    if (level === 11) return 2;
    if (level === 12) return 5;
    return 5 * Math.pow(3, level - 12);
}

function calculateLevel(totalXp, levelData) {
    let currentLevel = 1, perk = '혜택 없음', nextLevelXp = 0, nextPerk = '최고 레벨';
    let tickets = {};

    if (levelData.length > 0) {
        perk = levelData[0][2] || '혜택 없음';
        nextLevelXp = parseInt(levelData[0][1]) || 1;
        if (levelData.length > 1) nextPerk = levelData[1][2] || '혜택 없음';

        for (let i = 0; i < levelData.length; i++) {
            const level = parseInt(levelData[i][0]);
            const requiredXp = parseInt(levelData[i][1]);
            
            if (totalXp >= requiredXp) {
                currentLevel = level;
                perk = levelData[i][2] || '혜택 없음';
                tickets = { plus7: levelData[i][3], plus10: levelData[i][4], plus11: levelData[i][5], plus12: levelData[i][6] };

                if (i + 1 < levelData.length) {
                    nextLevelXp = parseInt(levelData[i+1][1]);
                    nextPerk = levelData[i+1][2] || '혜택 없음';
                } else {
                    nextLevelXp = requiredXp;
                    nextPerk = '최고 레벨';
                }
            } else {
                nextLevelXp = requiredXp;
                nextPerk = levelData[i][2] || '혜택 없음';
                break; 
            }
        }
    }
    return { currentLevel, perk, nextLevelXp, nextPerk, tickets };
}


// --- Main Handler ---
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

    if (queryType === 'getUserProfile') {
        const nickname = event.queryStringParameters.nickname;
        if (!nickname) return { statusCode: 400, body: JSON.stringify({ error: 'Nickname is required.' }) };

        const [rankingRes, levelRes] = await Promise.all([
            sheets.spreadsheets.values.get({ spreadsheetId, range: '강화랭킹!A:B' }),
            sheets.spreadsheets.values.get({ spreadsheetId, range: '레벨!A:G' })
        ]);

        const rankingRows = rankingRes.data.values || [];
        const userRanks = rankingRows.filter(row => row[0] === nickname);
        const totalXp = userRanks.reduce((sum, row) => sum + calculateXp(parseInt(row[1], 10)), 0);
        const levelData = levelRes.data.values ? levelRes.data.values.slice(1) : [];
        const profile = calculateLevel(totalXp, levelData);

        return {
            statusCode: 200,
            headers: { 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({
                level: profile.currentLevel,
                currentXp: totalXp,
                nextLevelXp: profile.nextLevelXp,
                perk: profile.perk,
                nextPerk: profile.nextPerk,
                tickets: profile.tickets
            })
        };

    } else if (queryType === 'getAmpUserProfile') {
        const nickname = event.queryStringParameters.nickname;
        if (!nickname) return { statusCode: 400, body: JSON.stringify({ error: 'Nickname is required.' }) };

        const [rankingRes, levelRes] = await Promise.all([
            sheets.spreadsheets.values.get({ spreadsheetId, range: '증폭랭킹!A:B' }),
            sheets.spreadsheets.values.get({ spreadsheetId, range: '레벨2!A:G' })
        ]);

        const rankingRows = rankingRes.data.values || [];
        const userRanks = rankingRows.filter(row => row[0] === nickname);
        // 증폭 경험치 계산 로직으로 변경
        const totalXp = userRanks.reduce((sum, row) => sum + calculateAmpXp(parseInt(row[1], 10)), 0);
        const levelData = levelRes.data.values ? levelRes.data.values.slice(1) : [];
        const profile = calculateLevel(totalXp, levelData);

        return {
            statusCode: 200,
            headers: { 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({
                level: profile.currentLevel,
                currentXp: totalXp,
                nextLevelXp: profile.nextLevelXp,
                perk: profile.perk,
                nextPerk: profile.nextPerk,
                tickets: profile.tickets
            })
        };
    }

    // Fallback for generic sheet reading
    const sheetName = event.queryStringParameters.sheetName;
    if (!sheetName) {
        return { statusCode: 400, body: JSON.stringify({ error: 'sheetName is required for generic query.' }) };
    }

    let range = `${sheetName}!A:I`; // Default range
    if (sheetName === '지도') {
        range = '지도!A:M'; // Wider range for map data
    }

    const response = await sheets.spreadsheets.values.get({ spreadsheetId, range });
    console.log('Raw data from Google Sheets API:', response.data.values);

    let rows = response.data.values || [];
    let dataToReturn = rows.length > 1 ? rows.slice(1) : [];

    // Process character data for consistency, especially for weapon stats
    if (sheetName === '캐릭터') { // Apply this processing only for the '캐릭터' sheet
        dataToReturn = dataToReturn.map(row => {
            // Ensure weaponName and weaponRarity are strings
            row[8] = row[8] || ''; // weaponName
            row[9] = row[9] || ''; // weaponRarity

            // Ensure reinforce, amplification, refine are numbers, defaulting to 0
            row[10] = Number(row[10] || 0); // reinforce
            row[11] = Number(row[11] || 0); // amplification
            row[12] = Number(row[12] || 0); // refine

            // Also ensure fame and guildName are handled here for consistency
            row[7] = Number(row[7] || 0); // fame
            row[6] = row[6] || ''; // guildName
            row[5] = row[5] || ''; // adventureName
            row[4] = row[4] || ''; // timestamp
            row[0] = row[0] || ''; // server
            row[1] = row[1] || ''; // nickname

            return row;
        });
    }
    console.log('Processed dataToReturn before sending to client:', dataToReturn);

    const filterColumn = event.queryStringParameters.filterColumn;
    const filterValue = event.queryStringParameters.filterValue;

    if (filterColumn && filterValue) {
        const columnIndex = parseInt(filterColumn, 10);
        if (!isNaN(columnIndex)) {
            dataToReturn = dataToReturn.filter(row => row[columnIndex] === filterValue);
        }
    }

    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ data: dataToReturn }),
    };

  } catch (error) {
    console.error('Error in sheets function:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message || 'Failed to process request.' })
    };
  }
};