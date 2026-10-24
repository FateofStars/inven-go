/**
 * 设计 token —— 全 App 唯一的数值与颜色来源。
 *
 * 约定（Refactoring UI）：
 * - 间距只允许 4 / 8 / 12 / 16 / 24 / 32 六档；
 * - 文字只用 400 与 700 两种字重，靠字色与字号拉开层级；
 * - 圆角、海拔分别取自固定集合，不再逐组件手调；
 * - 语义色的 `strong` 档专供浅色底上的文字（对比度 ≥ 4.5:1），
 *   `base` 档用于填充与图标，`soft` 档用于底。
 */

export const colors = {
  // —— 中性 ——
  bg: '#F3EFE6',
  card: '#FFFCF7',
  line: '#E4DCCF',
  ink: '#1C1915',
  muted: '#6F675C',
  white: '#FFFFFF',
  scrim: 'rgba(28, 25, 21, 0.55)',
  camera: '#10110F',

  // —— 深色面上的文字：手挑的同色相浅档，不用白色降透明度 ——
  onInk: '#F7F2E8',
  onInkMuted: '#D9CBB8',
  onInkFaint: '#C8BEB0',
  onInkDanger: '#F0A097',
  /** 深色面上的描边：3:1，刚好满足图形边界的可见度。 */
  onInkLine: '#6B665E',

  // —— 语义色 ——
  // 使用规则：teal = 行动 / 主按钮；navy = 次要行动；green = 状态（已置顶、使用中、增加）；
  // danger = 破坏性；clay = 出库 / 减少；warning = 提醒 / 导出。状态色不做行动按钮的填充色。
  teal: '#0E6B5C',
  tealStrong: '#08493F',
  tealSoft: '#E5F3EF',

  green: '#1B6A4C',
  greenStrong: '#134C36',
  greenSoft: '#E6F4EA',

  clay: '#C4622D',
  clayStrong: '#8A3F17',
  claySoft: '#F8E6D8',

  navy: '#243E73',
  navyStrong: '#182B52',
  navySoft: '#E4EAF6',

  danger: '#A33B32',
  dangerStrong: '#7C2A23',
  dangerSoft: '#F8E4E1',

  warning: '#B9770E',
  warningStrong: '#7A4E06',
  warningSoft: '#F8EED9',

  // —— 特定场景 ——
  highlight: '#F8E7A8',
  pinMuted: '#9CA3AF',
  placeholderLine: '#C9C0B2',
  overlay: 'rgba(16, 17, 15, 0.62)',

  // —— Toast 浮层：深色底 + 同色相浅字，不参与页面配色 ——
  toastSuccessBg: '#173F2E',
  toastWarningBg: '#6E3B16',
  toastInfoBg: '#1C2E52',
  toastWarningText: '#FFF4E8',
  toastHint: '#F3D7B5',
} as const;

/**
 * 间距阶梯：页面留白、组件内外间距一律从这里取。
 *
 * 列表纵向节奏约定：密集行 8（日志）、卡片 12（首页 / 设置）、
 * 需要为阴影留位的卡片 16（数据库，由 Swipeable 的内边距撑出）。
 */
export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

/** 圆角阶梯：卡片 16、内部控件 12、面板 24、底部面板 28、胶囊 999。 */
export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  sheet: 28,
  pill: 999,
} as const;

/** 字重只有两档：正文 400，标题/数字/按钮 700。 */
export const weight = {
  regular: '400',
  bold: '700',
} as const;

/** 字号阶梯：正文 12 / 14 / 16 / 18，标题 20 / 24，数字 32 / 44 / 56。 */
export const type = {
  caption: { fontSize: 12, lineHeight: 18 },
  body: { fontSize: 14, lineHeight: 22 },
  bodyTight: { fontSize: 14, lineHeight: 20 },
  bodyLg: { fontSize: 16, lineHeight: 24 },
  title: { fontSize: 18, lineHeight: 26 },
  heading: { fontSize: 20, lineHeight: 28 },
  display: { fontSize: 24, lineHeight: 32 },
  number: { fontSize: 32, lineHeight: 36 },
  numberLg: { fontSize: 44, lineHeight: 48 },
  numberHero: { fontSize: 56, lineHeight: 60 },
} as const;

/** 控件与固有尺寸：热区不小于 44，常规控件 48，其余为布局常量。 */
export const size = {
  touch: 44,
  control: 48,
  controlSm: 40,
  iconTile: 40,
  iconTileSm: 32,
  /** 徽标 / 错误小圆点。 */
  badge: 20,
  /** 底部面板抓手宽度。 */
  sheetHandle: 40,
  /** 左滑操作按钮宽度，各页共用。 */
  swipeAction: 76,
  /**
   * 紧凑行动按钮：32 方块 + 16 图标。
   * 目前用于二级界面头部的新建、以及卡片标题右侧的新增按钮。
   */
  actionCompact: 32,
  /** 空状态主图标的尺寸。 */
  emptyIcon: 40,
  logo: 156,
  scanFrameWidth: 260,
  scanFrameHeight: 160,
  modalMaxWidth: 420,
  /** 添加商品面板里搜索结果区的固定高度。 */
  searchListHeight: 216,
  /** 粘贴备份的多行输入区高度。 */
  textAreaHeight: 144,
  tabBarHeight: 64,
} as const;

/** 交互状态：禁用透明度只在这里定义一次。 */
export const state = {
  disabled: 0.4,
} as const;

/**
 * 系统字号放大的上限。
 *
 * RN 的 allowFontScaling 只放大 fontSize，不放大 lineHeight：固定行高的大字号文本
 * 在大字号下会互相挤压。标题 1.3×、展示数字 1.1×（行高贴近 1），正文与小字 1.4×
 * —— 1.4 仍小于标题的 1.3× 字号上限，保证任何缩放档位下正文都不会反超标题。
 */
export const textScale = {
  title: 1.3,
  body: 1.4,
  number: 1.1,
} as const;

/**
 * 海拔五级：卡片 1 → 浮层 2 → 底部面板 3 → 居中弹窗 4 → 拖拽悬浮 5。
 * 全部满足「光从上方来」：x 偏移为 0，y 偏移为正。
 */
export const elevation = {
  card: {
    shadowColor: '#1C1915',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  float: {
    shadowColor: '#1C1915',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 14,
    elevation: 4,
  },
  sheet: {
    shadowColor: '#1C1915',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 24,
    elevation: 8,
  },
  modal: {
    shadowColor: '#1C1915',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.18,
    shadowRadius: 32,
    elevation: 16,
  },
  drag: {
    shadowColor: '#1C1915',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.24,
    shadowRadius: 36,
    elevation: 24,
  },
} as const;

/** 统一按压反馈：所有可点元素共用一套，不做缩放抖动。 */
export const press = { opacity: 0.72 } as const;
