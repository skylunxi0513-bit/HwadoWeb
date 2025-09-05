const { google } = require('googleapis');

// --- Helper Functions ---
function calculateXp(level) {
    if (level < 12) return 0;
    return Math.pow(3, level - 12);
}

function calculateLevel(totalXp, levelData) {
    let currentLevel = 0;
    let nextLevelXp = 0;
    let perk = '혜택 없음';
    let nextPerk = '최고 레벨';

    if (levelData.length > 0) {
        // Default to level 1 if not enough XP for higher levels
        if (totalXp < (parseInt(levelData[0][1]) || 1)) {
             currentLevel = 1;
             perk = levelData[0][2] || '혜택 없음';
             nextLevelXp = parseInt(levelData[0][1]) || 1;
             if (levelData.length > 1) {
                 nextPerk = levelData[1][2] || '혜택 없음';
             }
        } else {
            for (let i = 0; i < levelData.length; i++) {
                const level = parseInt(levelData[i][0]);
                const requiredXp = parseInt(levelData[i][1]);
                
                if (totalXp >= requiredXp) {
                    currentLevel = level;
                    perk = levelData[i][2] || '혜택 없음';
                    // Check for next level
                    if (i + 1 < levelData.length) {
                        nextLevelXp = parseInt(levelData[i+1][1]);
                        nextPerk = levelData[i+1][2] || '혜택 없음';
                    } else {
                        nextLevelXp = requiredXp; // At max level
                        nextPerk = '최고 레벨';
                    }
                } else {
                    // This case is for when the user is between levels not starting from 0
                    nextLevelXp = requiredXp;
                    nextPerk = levelData[i][2] || '혜택 없음';
                    break; 
                }
            }
        }
    }
     if (currentLevel === 0 && levelData.length > 0) currentLevel = 1;

    return { currentLevel, perk, nextLevelXp, nextPerk };
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

    // --- Get User Profile Query ---
    if (queryType === 'getUserProfile') {
        const nickname = event.queryStringParameters.nickname;
        if (!nickname) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Nickname is required.' }) };
        }

        const [rankingRes, levelRes] = await Promise.all([
            sheets.spreadsheets.values.get({ spreadsheetId, range: '강화랭킹!A:B' }),
            sheets.spreadsheets.values.get({ spreadsheetId, range: '레벨!A:C' })
        ]);

        const rankingRows = rankingRes.data.values || [];
        const userRanks = rankingRows.filter(row => row[0] === nickname);
        const totalXp = userRanks.reduce((sum, row) => {
            const level = parseInt(row[1], 10);
            return sum + calculateXp(level);
        }, 0);

        const levelData = levelRes.data.values ? levelRes.data.values.slice(1) : [];
        const { currentLevel, perk, nextLevelXp, nextPerk } = calculateLevel(totalXp, levelData);

        return {
            statusCode: 200,
            headers: { 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({
                level: currentLevel,
                currentXp: totalXp,
                nextLevelXp: nextLevelXp,
                perk: perk,
                nextPerk: nextPerk
            }),
        };
    }

    // --- Default: Fetch sheet data by name ---
    const sheetName = event.queryStringParameters.sheetName;
    if (!sheetName) {
        return { statusCode: 400, body: JSON.stringify({ error: 'sheetName is required.' }) };
    }

    const range = `${sheetName}!A:I`;
    const response = await sheets.spreadsheets.values.get({ spreadsheetId, range });

    let rows = response.data.values || [];
    const dataToReturn = rows.length > 1 ? rows.slice(1) : [];

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
