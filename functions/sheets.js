const { google } = require('googleapis');

exports.handler = async function(event, context) {
  try {
    // 1. 환경 변수에서 서비스 계정 키 가져오기
    const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
    if (!privateKey) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Service account key not found in environment variables.' }),
      };
    }

    // JSON 문자열을 파싱하여 객체로 변환
    const credentials = JSON.parse(privateKey);

    // 2. Google 인증 설정
    const auth = new google.auth.JWT(
      credentials.client_email,
      null,
      credentials.private_key.replace(/\\n/g, '\n'), // private_key의 \n 문자를 실제 줄바꿈으로 변환
      ['https://www.googleapis.com/auth/spreadsheets.readonly'] // 읽기 전용 권한
    );

    const sheets = google.sheets({ version: 'v4', auth });

    // 3. 요청 파라미터 가져오기
    const spreadsheetId = '1H5Hb_zXA9A34XtkScIovnTNAMFXwHQc_fCPqQfB_ALQ'; // 사용자가 제공한 스프레드시트 ID
    const sheetName = event.queryStringParameters.sheetName || '스킬코드'; // 기본값: 스킬코드
    const filterColumnIndex = event.queryStringParameters.filterColumn ? parseInt(event.queryStringParameters.filterColumn) : null; // 0-indexed
    const filterValue = event.queryStringParameters.filterValue || null;

    // 4. 스프레드시트 데이터 읽기
    const range = `${sheetName}!A:E`; // A열부터 E열까지 읽기
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

    // 첫 번째 행은 헤더로 간주하고 필터링에서 제외
    const headers = rows[0];
    const dataRows = rows.slice(1);

    // 5. 데이터 필터링
    let filteredData = dataRows;
    if (filterColumnIndex !== null && filterValue !== null) {
      filteredData = dataRows.filter(row => {
        // filterColumnIndex가 유효하고, 해당 열의 값이 filterValue와 일치하는 경우 (공백 제거 및 대소문자 무시)
        return row[filterColumnIndex] !== undefined && row[filterColumnIndex].trim().toLowerCase() === filterValue.trim().toLowerCase();
      });
    }

    // 6. 결과 반환
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*' // CORS 허용
      },
      body: JSON.stringify({ headers, data: filteredData }),
    };

  } catch (error) {
    console.error('Error fetching from Google Sheets:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message || 'Failed to fetch data from Google Sheets.' }),
    };
  }
};
