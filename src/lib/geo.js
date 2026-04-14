/**
 * Detects if a request originates from India based on IP address.
 * Uses a public API for detection.
 */
export async function isUserInIndia(ip) {
  if (!ip || ip === '::1' || ip === '127.0.0.1') {
    return true; // Default to India for local development
  }

  try {
    const response = await fetch(`https://ipapi.co/${ip}/json/`);
    const data = await response.json();
    return data.country_code === 'IN';
  } catch (error) {
    console.error('Geo detection error:', error);
    return true; // Fallback to India for safety
  }
}
