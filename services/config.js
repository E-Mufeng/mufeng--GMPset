// 工具箱后端配置
// 所有敏感参数集中在此文件，避免硬编码在各处模块中

module.exports = {
  // DeepSeek API
  DEEPSEEK_API_KEY: 'sk-20b381a881124d288ecd6f9c04548a13',
  DEEPSEEK_API: 'https://api.deepseek.com/v1/chat/completions',
  DEEPSEEK_BALANCE_API: 'https://api.deepseek.com/user/balance',

  // 数据存储路径
  DATA_DIR: __dirname + '/data',
};
