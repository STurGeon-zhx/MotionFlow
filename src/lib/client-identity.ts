export const DEVICE_COOKIE_NAME = 'motion_device_id';

export function normalizeDeviceId(value: string | undefined | null) {
  const deviceId = value?.trim() ?? '';
  return /^device_[a-f0-9]{32}$/.test(deviceId) ? deviceId : 'unknown';
}

function readCookie(request: Request, name: string) {
  const cookie = request.headers.get('cookie') ?? '';
  for (const part of cookie.split(';')) {
    const [key, ...valueParts] = part.trim().split('=');
    if (key === name) {
      try {
        return decodeURIComponent(valueParts.join('='));
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}

export function getClientOwnerId(request: Request) {
  const trustedDeviceId = normalizeDeviceId(request.headers.get('x-motion-device-id'));
  if (trustedDeviceId !== 'unknown') return trustedDeviceId;
  return normalizeDeviceId(readCookie(request, DEVICE_COOKIE_NAME));
}
