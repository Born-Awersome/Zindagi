export const categories = [
  { id: 'academics', name: 'Academics', icon: '◈', color: '#367767' },
  { id: 'career', name: 'Career', icon: '▣', color: '#a77a37' },
  { id: 'social', name: 'Connection', icon: '◎', color: '#9a6582' },
  { id: 'fitness', name: 'Fitness', icon: '›', color: '#668753' },
  { id: 'cultural', name: 'Cultural', icon: '✳', color: '#7474ad' },
];
export const tasks = [
  { id: 'study', category: 'academics', title: 'Make room for deep focus', description: 'Put distractions away. Study for 50 minutes, then recharge with a 10-minute break.', minutes: 60, focus: 50, break: 10, points: 1, tag: 'FOCUS SESSION' },
  { id: 'portfolio', category: 'career', title: 'Build something you’re proud of', description: 'Spend an hour making progress on a portfolio project. Finish with one clear deliverable.', minutes: 60, points: 1, tag: 'BUILD YOUR FUTURE' },
  { id: 'connect', category: 'social', title: 'Have a meaningful conversation', description: 'Connect with someone in your field. Ask about their journey and write down three takeaways.', minutes: 30, points: 1, tag: 'MAKE A CONNECTION' },
  { id: 'move', category: 'fitness', title: 'Show up for your body', description: 'Complete a 30-minute workout at a pace that suits you, including a warm-up and cooldown.', minutes: 30, points: 1, tag: 'MOVE WITH PURPOSE' },
  { id: 'create', category: 'cultural', mode: 'recording', title: 'Showcase your cultural talent', description: 'Sing, play guitar, dance, or share another cultural talent. Capture a fresh photo or video with your camera, review it, and submit it.', points: 1, tag: 'YOUR TALENT. YOUR STAGE.' },
];
export const people = [
  { name: 'Aarav Mehta', initials: 'AM', role: 'Learning a little, every day', category: 'academics', points: 24, color: '#eadcca' },
  { name: 'Meera Shah', initials: 'MS', role: 'Sharing music and culture', category: 'cultural', points: 21, color: '#e7deed' },
  { name: 'Kabir Rao', initials: 'KR', role: 'Building better habits', category: 'fitness', points: 18, color: '#dce5d3' },
];
