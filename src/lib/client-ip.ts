const firstAddress = (value: string) => value.split(',')[0]?.trim() ?? '';

export function normalizeClientIp(value: string) {
  let address = firstAddress(value).replace(/^"|"$/g, '');
  if (address.startsWith('[')) {
    const closingBracket = address.indexOf(']');
    if (closingBracket > 0) address = address.slice(1, closingBracket);
  }
  if (address.startsWith('::ffff:')) address = address.slice(7);
  if (/^\d{1,3}(?:\.\d{1,3}){3}:\d+$/.test(address)) address = address.replace(/:\d+$/, '');
  if (address === '::1' || address === 'localhost') return '127.0.0.1';
  return address || 'unknown';
}

export function getClientIp(request: Request) {
  const trustedAddress = request.headers.get('x-motion-client-ip');
  if (trustedAddress) return normalizeClientIp(trustedAddress);

  // 兼容直接使用 Next.js 命令启动的旧环境。项目自带服务器会覆盖上面的可信请求头。
  const forwardedAddress = request.headers.get('x-forwarded-for') ?? request.headers.get('x-real-ip');
  return normalizeClientIp(forwardedAddress ?? 'unknown');
}
