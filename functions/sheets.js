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

    for (let i = 0; i < levelData.length; i++) {
        const level = parseInt(levelData[i][0]);
        const requiredXp = parseInt(levelData[i][1]);
        
        if (totalXp >= requiredXp) {
            currentLevel = level;
            perk = levelData[i][2] || '혜택 없음';
        } else {
            nextLevelXp = requiredXp;
            break; // Found the next level
        }
        // If it's the last defined level, there is no next level
        if (i === levelData.length - 1) {
            nextLevelXp = requiredXp; 
        }
    }
    return { currentLevel, perk, nextLevelXp };
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

        // 1. Fetch both sheets in parallel
        const [rankingRes, levelRes] = await Promise.all([
            sheets.spreadsheets.values.get({ spreadsheetId, range: '강화랭킹!A:B' }),
            sheets.spreadsheets.values.get({ spreadsheetId, range: '레벨!A:C' })
        ]);

        // 2. Calculate Total XP from ranking data
        const rankingRows = rankingRes.data.values || [];
        const userRanks = rankingRows.filter(row => row[0] === nickname);
        const totalXp = userRanks.reduce((sum, row) => {
            const level = parseInt(row[1], 10);
            return sum + calculateXp(level);
        }, 0);

        // 3. Determine Level and Perks from level data
        const levelData = levelRes.data.values ? levelRes.data.values.slice(1) : []; // Skip header
        const { currentLevel, perk, nextLevelXp } = calculateLevel(totalXp, levelData);

        return {
            statusCode: 200,
            headers: { 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({
                level: currentLevel,
                currentXp: totalXp,
                nextLevelXp: nextLevelXp,
                perk: perk
            }),
        };
    }

    // --- Default: Fetch sheet data by name ---
    const sheetName = event.queryStringParameters.sheetName;
    if (!sheetName) {
        return { statusCode: 400, body: JSON.stringify({ error: 'sheetName is required.' }) };
    }

    const range = `${sheetName}!A:F`; // Expanded range for safety
    const response = await sheets.spreadsheets.values.get({ spreadsheetId, range });

    let rows = response.data.values || [];
    const dataToReturn = rows.length > 1 ? rows.slice(1) : []; // Return data rows, or empty if only header/no rows

    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ data: dataToReturn }), // Simplified response
    };

  } catch (error) {
    console.error('Error in sheets function:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message || 'Failed to process request.' })
    };
  }
};