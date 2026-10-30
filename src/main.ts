const mode = new URLSearchParams(location.search).get('mode')
if (mode === 'checkmate') {
  const { startCheckmate } = await import('./checkmate/ui')
  startCheckmate()
} else {
  await import('./classic')
}
export {}
