const ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/**
 * 用于把不可信文本拼进 innerHTML 的场景（例如 leaflet 的 divIcon）。
 * 房间成员的昵称由其他玩家自己填写，直接拼进 HTML 会形成存储型 XSS。
 */
export const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (char) => ESCAPE_MAP[char] || char);

export default escapeHtml;
