const fetch = require('node-fetch');

exports.handler = async function(event, context) {
  const { itemName, limit = 10 } = event.queryStringParameters;
  const apiKey = 'gvn930ycSXuc3OpEcHhWsUx1Ka9El1X5'; // Existing API key

  if (!itemName) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: '아이템 이름을 입력해주세요.' }),
    };
  }

  const encodedItemName = encodeURIComponent(itemName);
  const url = `https://api.neople.co.kr/df/auction?itemName=${encodedItemName}&sort=unitPrice:asc&limit=${limit}&apikey=${apiKey}`;

  try {
    const response = await fetch(url);
    const data = await response.json();

    if (!data.rows || data.rows.length === 0) {
        return {
            statusCode: 200,
            body: JSON.stringify({ averagePrice: 0 }),
        };
    }

    const total = data.rows.reduce((sum, item) => sum + item.unitPrice, 0);
    const averagePrice = total / data.rows.length;

    return {
      statusCode: 200,
      body: JSON.stringify({ averagePrice: Math.round(averagePrice) }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'API 호출 중 에러가 발생했습니다.' }),
    };
  }
};
