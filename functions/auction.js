const fetch = require('node-fetch');

exports.handler = async function(event, context) {
  // 1. 웹사이트에서 요청한 아이템 이름을 가져옵니다.
  const itemName = event.queryStringParameters.itemName;
  const apiKey = 'gvn930ycSXuc3OpEcHhWsUx1Ka9El1X5'; // 사용자가 제공한 API 키

  // 아이템 이름이 없는 경우 에러 처리
  if (!itemName) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: '아이템 이름을 입력해주세요.' }),
    };
  }

  // 2. 네오플 API에 보낼 주소를 만듭니다.
  const encodedItemName = encodeURIComponent(itemName);
  const url = `https://api.neople.co.kr/df/auction?itemName=${encodedItemName}&sort=unitPrice:asc&limit=1&apikey=${apiKey}`;

  try {
    // 3. 네오플 API를 호출합니다.
    const response = await fetch(url);
    const data = await response.json();

    // 4. API에서 받은 결과를 웹사이트로 다시 전달합니다.
    return {
      statusCode: 200,
      body: JSON.stringify(data),
    };
  } catch (error) {
    // 에러가 발생한 경우 에러 처리
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'API 호출 중 에러가 발생했습니다.' }),
    };
  }
};
