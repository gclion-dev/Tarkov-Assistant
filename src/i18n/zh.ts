export default {
  // 公共词汇
  common: {
    require: '要求',
    unit: '单位',
    empty: '无',
    use: '使用',
    trader: '商人',
    reward: '奖励',
    objective: '目标',
    foundInRaid: '战局中发现',
    skill: '技能',
    levelReach: '等级达到',
    minute: '分钟',
    enable: '启用',
    disable: '禁用',
    item: '物品',
  },

  // 杂项
  others: {
    selectMap: '选择地图',
    surface: '表层',
    colorSetting: '颜色设置',
    strokeWidth: '笔刷宽度',
    eraserWidth: '橡皮宽度',
  },

  // 互动地图
  interactive: {
    title: '互动地图',
    mapLoading: '互动地图载入中...',
  },

  // 任务介绍
  tasks: {
    title: '任务介绍',
    searchPlaceholder: '搜索任务名、商人、目标...',
    allTraders: '全部商人',
    allMaps: '全部地图',
    kappaOnly: '仅 Kappa',
    resultCount: '共 {n} 个任务',
    empty: '没有找到符合条件的任务',
    pick: '从左侧选择一个任务查看详情',
    back: '返回列表',
    level: '等级',
    exp: '经验',
    faction: '阵营',
    wiki: '查看 Wiki 攻略',
    requirements: '前置任务',
    objectives: '任务目标',
    rewards: '完成奖励',
    optional: '可选',
  },

  // 联系信息
  contact: {
    email: '联系邮箱: 1535726542@qq.com',
  },

  // 地图信息
  mapInfo: {
    title: '概览',
    gameTime: '游戏时间:',
    pmcs: 'PMC数量:',
    raidTime: '战局时间:',
  },

  // 地图功能
  marker: {
    extracts: '撤离点',
    legends: '物资箱',
    spawns: '出生点',
    others: '其他',
    tasks: '任务',
    questItem: '任务物品',
    questObjective: '任务目标',
    looseLoot: '散落物资',
    layers: '图层',
    showAll: '全开',
    hideAll: '全关',
    extractPmc: 'PMC 撤离',
    extractScav: 'Scav 撤离',
    extractShared: '共享撤离',
    spawnScav: 'Scav',
    spawnSniper: '狙击 Scav',
    spawnBoss: 'Boss',
    spawnPmc: 'PMC',
    lock: '门锁',
    hazard: '危险区',
    stationaryWeapon: '固定武器',
    lootValuable: '高价值',
    lootGood: '较好',
    lootCommon: '常见',
  },

  // 设置
  setting: {
    title: '高级设置',
    realtimeMarker: '截图目录:',
    enableMarker: '选择塔科夫截图目录',
    resumeMarker: '点击恢复监听截图目录',
    tarkovGamePath: '游戏目录:',
    enableTarkovGamePath: '选择塔科夫游戏目录',
    resumeTarkovGamePath: '点击恢复监听游戏目录',
    markerScale: '标点缩放',
  },

  // 登录
  login: {
    title: '欢迎回来',
    text: '协作房间需要登录后使用，其余功能无需登录。',
    registerTitle: '创建账户',
    registerText: '注册后即可创建协作房间，和队友互相看到彼此的位置。',
    textClient: '请使用客户端提供的账户登录功能。',
    account: '邮箱',
    nickname: '昵称',
    password: '密码',
    loginBtn: '登入',
    registerBtn: '注册账户',
    recoveryBtn: '找回密码',
    returnBtn: '返回地图',
    passwordHint: '密码至少 8 位',
    failed: '登录失败',
  },

  // 房间
  room: {
    title: '协作房间',
    create: '创建房间',
    join: '加入房间',
    leave: '离开房间',
    code: '房间号',
    copy: '复制',
    copied: '已复制房间号',
    copyFailed: '复制失败',
    members: '在线成员',
    host: '房主',
    created: '房间已创建',
    joined: '已加入房间',
    left: '已离开房间',
    enterCode: '请输入房间号',
    codePlaceholder: '输入6位房间号',
    createFailed: '创建房间失败',
    joinFailed: '加入房间失败',
    reconnecting: '重连中...',
  },

  // Toast
  toast: {
    alert: '您正在使用逃离塔科夫助手开源版本，请勿删除此条消息',
  },

  // EFT Watcher
  eftwatcher: {
    title: '重磅更新！',
    tips1: '现已支持自动获取坐标，您只需选择您的塔科夫截图目录即可！',
    tips2: '现已支持自动切换地图，只需选择您的塔科夫游戏目录/日志目录即可！',
    tips3: '请注意，您仍需使用游戏内的截图按键才可获取您当前的位置信息。',
    tips4: '参考截图目录: C:\\Users\\[User]\\Documents\\Escape from Tarkov',
    tips5: '参考游戏目录: C:\\Games\\EFT\\Logs',
    enableScrPath: '选择塔科夫截图目录',
    resumeScrPath: '点击恢复监听截图目录',
    disableScrPath: '已监听塔科夫截图目录',
    enableGamePath: '选择塔科夫游戏目录',
    resumeGamePath: '点击恢复监听游戏目录',
    disableGamePath: '已监听塔科夫游戏目录',
    unsupport: '您的浏览器版本不支持',
    later: '我已知晓，可在设置中启用',
    unsupportMsg: '您的浏览器版本不支援该功能，请使用Chrome或Edge！',
    tips6: '将本站安装为应用后（地址栏右侧的安装按钮），目录授权可长期保留，无需反复选择。',
  },

  // 警告和说明
  warning: {
    title: '您正在使用开源版本',
    tips1: '请严格遵守使用协议。',
    move_w: '向上移动',
    move_a: '向左移动',
    move_s: '向下移动',
    move_d: '向右移动',
    ctrl_q: '手动定位/搜索',
    ctrl_g: '简易UI模式',
    ctrl_a: '拖拽模式',
    ctrl_s: '笔刷模式',
    ctrl_d: '橡皮模式',
    ctrl_f: '测距模式',
  },
};
