/** @type {import('@capacitor/cli').CapacitorConfig} */
module.exports = {
  appId: "com.ainotes.app",
  appName: "AI Notes",
  webDir: "www",
  // server.url: set via CAPACITOR_SERVER_URL env; omit to use bundled assets
  ...(process.env.CAPACITOR_SERVER_URL && {
    server: { url: process.env.CAPACITOR_SERVER_URL, cleartext: false },
  }),
};
