// Shot ideas. Data only: suggest.js picks from this list.
//
// Fields:
//   needs     phenomenon ids; the idea is offered when any of them is present
//   site      site id the idea belongs to, or null for a roaming idea. When a
//             phenomenon lists sites, a site idea is only offered if it is one.
//   sessions  which sessions the idea suits
//   avoid     phenomenon ids that rule the idea out
//   timing    'glow' | 'golden' | 'blue' | 'session' | 'phenomenon'
//   weight    relative appeal when the phenomenon is at full strength
//   place     where to stand, in words
//   shot      what to frame and how
//   kit       lens and settings; {tele} {wide} {normal} {compact} {short_tele}
//             are filled from KIT in config.js
//   sim       film simulation

const STORM = ['thunder'];
const WET = ['rain', 'thunder'];

export const IDEAS = [
  // Fog
  {
    id: 'bridge-above-fog', needs: ['fog-under-bridge'], site: 'hawk-hill', sessions: ['morning', 'evening'], avoid: STORM, timing: 'glow', weight: 1.0,
    place: 'Hawk Hill or Battery Spencer',
    shot: 'Golden Gate Bridge towers standing out of the fog, the skyline behind. Stack the two towers, then go wide for the fog river.',
    kit: '{tele} at 90 to 160mm, f/8, tripod if the light is low',
    sim: 'Classic Chrome',
  },
  {
    id: 'tam-fog-sea', needs: ['fog-sea'], site: 'mount-tam', sessions: ['morning', 'evening'], avoid: STORM, timing: 'glow', weight: 0.9,
    place: 'Mount Tamalpais, Trojan Point or East Peak (check the park gate hours)',
    shot: 'Fog filling the valleys with ridge lines layered above it. Thirty seconds or longer at blue hour turns the fog into slow waves.',
    kit: '{tele} for layered ridges, {wide} for the full sea; tripod',
    sim: 'Velvia in colour, Acros for the layers',
  },
  {
    id: 'twin-peaks-fog-sea', needs: ['fog-sea', 'fog-arriving'], site: 'twin-peaks', sessions: ['morning', 'evening'], avoid: STORM, timing: 'glow', weight: 0.8,
    place: 'Twin Peaks',
    shot: 'Sutro Tower and the downtown towers rising out of the fog. Stay into blue hour for city light glowing up through it.',
    kit: '{tele} at 100 to 230mm, tripod after sunset',
    sim: 'Classic Chrome',
  },
  {
    id: 'grand-view-fog', needs: ['fog-sea', 'fog-arriving'], site: 'grand-view', sessions: ['morning', 'evening'], avoid: STORM, timing: 'golden', weight: 0.65,
    place: 'Grand View Park',
    shot: 'Fog sliding over the Sunset District rooftops towards the park, the avenues running out to the ocean.',
    kit: '{short_tele} or {tele} to compress the rooftops',
    sim: 'Classic Neg',
  },
  {
    id: 'gate-fog-pour', needs: ['fog-arriving'], site: 'hawk-hill', sessions: ['evening'], avoid: STORM, timing: 'golden', weight: 0.75,
    place: 'Hawk Hill or Slacker Hill',
    shot: 'Fog pouring through the Golden Gate under the bridge. One to four second exposures show the flow.',
    kit: '{tele}, tripod, base ISO; a neutral density filter if the sun is still up',
    sim: 'Classic Chrome',
  },
  {
    id: 'forest-fog', needs: ['fog-in-trees'], site: null, sessions: ['morning', 'evening'], avoid: STORM, timing: 'session', weight: 0.8,
    place: 'Mount Davidson or the Mount Sutro forest trails',
    shot: 'Eucalyptus trunks fading into the fog; a single walker for scale. If the sun breaks through, shoot towards it for light shafts.',
    kit: '{normal} wide open, or {short_tele} to stack trunks',
    sim: 'Acros, or Classic Neg for muted greens',
  },
  {
    id: 'bay-bridge-fog', needs: ['bay-fog'], site: 'embarcadero', sessions: ['morning'], avoid: STORM, timing: 'blue', weight: 0.8,
    place: 'Pier 14 on the Embarcadero',
    shot: 'The Bay Bridge fading into fog span by span, pier railings as a leading line. Minimal and quiet.',
    kit: '{compact} or {normal}; tripod for a long exposure on flat water',
    sim: 'Acros',
  },
  {
    id: 'fog-minimal', needs: ['socked-in', 'marine-layer'], site: null, sessions: ['morning', 'evening'], avoid: STORM, timing: 'session', weight: 0.6,
    place: 'Ocean Beach, or Fort Point under the bridge',
    shot: 'Minimalism: lone figures on the sand, the bridge deck vanishing into grey, the Sutro Baths walls as simple shapes.',
    kit: '{short_tele} to isolate; expose a stop over so the fog stays white',
    sim: 'Acros',
  },
  {
    id: 'fog-edge', needs: ['fog-clearing'], site: 'twin-peaks', sessions: ['morning'], avoid: STORM, timing: 'session', weight: 0.6,
    place: 'Twin Peaks or Grand View Park',
    shot: 'The deck breaking up: patches of sun moving across the city, towers appearing and disappearing.',
    kit: '{tele}; meter for the sunlit patches',
    sim: 'Classic Chrome',
  },

  // Rain and storms
  {
    id: 'wet-streets-night', needs: ['rain'], site: null, sessions: ['evening'], avoid: STORM, timing: 'blue', weight: 0.75,
    place: 'Chinatown (Grant Avenue), North Beach (Columbus) or the Mission (Valencia and 24th)',
    shot: 'Neon and lanterns doubled in wet pavement, umbrellas in silhouette. Work from awnings and doorways.',
    kit: '{normal} at f/1.2 to f/2, 1/125 s, auto ISO; keep the camera under cover',
    sim: 'Classic Neg',
  },
  {
    id: 'rain-transit', needs: ['rain'], site: null, sessions: ['morning'], avoid: STORM, timing: 'session', weight: 0.65,
    place: 'Market Street and the Muni stops downtown',
    shot: 'Commuters and umbrellas, streetcar windows beaded with rain, headlights in the puddles.',
    kit: '{compact} or {normal}, 1/250 s; shoot from shelter',
    sim: 'Acros',
  },
  {
    id: 'rainbow-watch', needs: ['rainbow'], site: 'twin-peaks', sessions: ['morning', 'evening'], avoid: STORM, timing: 'golden', weight: 0.85,
    place: 'Twin Peaks or Grand View Park',
    shot: 'Rainbow watch. Keep the sun at your back and wait for a shower to pass in front of you; frame the bow over the city or the avenues.',
    kit: '{wide} for the whole bow, {tele} where it meets the skyline; no polarizer at full strength, it can erase the bow',
    sim: 'Velvia',
  },
  {
    id: 'clearing-storm', needs: ['clearing-storm'], site: null, sessions: ['morning', 'evening'], avoid: STORM, timing: 'glow', weight: 1.0,
    place: 'the best-scoring viewpoint below',
    shot: 'Clearing storm: broken cloud lit from underneath, washed air, wet ground. Light changes by the minute, so shoot wide and long from one spot.',
    kit: '{wide} and {tele}; bracket the sky',
    sim: 'Velvia',
  },
  {
    id: 'lightning', needs: ['thunder'], site: null, sessions: ['morning', 'evening'], avoid: [], timing: 'session', weight: 0.7,
    place: 'indoors or from the car, with a view over the Bay or the ocean',
    shot: 'Lightning. Point at the active cell and run back-to-back long exposures. Do not stand on a ridge, a beach or a pier.',
    kit: '{wide}, tripod, f/8, base ISO, 10 to 20 s',
    sim: 'Classic Chrome',
  },

  // Sea, wind and water
  {
    id: 'big-surf', needs: ['big-surf'], site: 'lands-end', sessions: ['morning', 'evening'], avoid: STORM, timing: 'golden', weight: 0.75,
    place: 'Fort Point, or the Lands End overlooks above Sutro Baths',
    shot: 'Sets wrapping the Fort Point seawall under the bridge, or spray exploding on the Lands End rocks. Stay above the wash.',
    kit: '{tele}; 1/1000 s to freeze spray or 1/4 s on a tripod for streaks',
    sim: 'Classic Chrome',
  },
  {
    id: 'glass-bay', needs: ['calm'], site: 'embarcadero', sessions: ['morning'], avoid: WET, timing: 'blue', weight: 0.6,
    place: 'Pier 14 or the old pilings south of the Ferry Building',
    shot: 'Bay Bridge and its lights mirrored on still water, pilings in the foreground.',
    kit: '{compact} or {wide}, tripod, 10 to 30 s',
    sim: 'Classic Chrome',
  },
  {
    id: 'lagoon-reflection', needs: ['calm'], site: null, sessions: ['evening'], avoid: WET, timing: 'blue', weight: 0.55,
    place: 'the Palace of Fine Arts lagoon',
    shot: 'The rotunda lit and mirrored in the lagoon at blue hour.',
    kit: '{wide} or {compact}, tripod, f/8',
    sim: 'Classic Chrome',
  },
  {
    id: 'sutro-pools', needs: ['low-tide'], site: 'lands-end', sessions: ['evening'], avoid: STORM, timing: 'phenomenon', weight: 0.7,
    place: 'Sutro Baths',
    shot: 'The ruins and tide pools as mirrors for the sky, the walls as leading lines to the sea.',
    kit: '{wide}, low to the water, tripod',
    sim: 'Velvia',
  },
  {
    id: 'bridge-wet-sand', needs: ['low-tide'], site: 'baker-beach', sessions: ['evening'], avoid: STORM, timing: 'phenomenon', weight: 0.6,
    place: 'Baker Beach, or Marshall\'s Beach for the rocks',
    shot: 'The bridge reflected in wet sand as each wave pulls back; rocks exposed at the north end.',
    kit: '{wide} or {compact}; half a second on a tripod for the receding water',
    sim: 'Classic Chrome',
  },
  {
    id: 'ocean-beach-low-tide', needs: ['low-tide'], site: 'ocean-beach', sessions: ['morning'], avoid: STORM, timing: 'phenomenon', weight: 0.5,
    place: 'Ocean Beach',
    shot: 'A wide mirror of wet sand under the dawn sky; walkers and dogs as small figures.',
    kit: '{short_tele} to compress figures against the surf',
    sim: 'Classic Neg',
  },

  // Air
  {
    id: 'long-lens-day', needs: ['crystal-air'], site: null, sessions: ['morning', 'evening'], avoid: WET, timing: 'golden', weight: 0.6,
    place: 'Lands End in the evening, Hawk Hill in the morning',
    shot: 'Long-lens clarity: the Farallon Islands on the horizon, or the skyline with the East Bay hills and Mount Diablo sharp behind it.',
    kit: '{tele} at 230mm, f/8, fast shutter',
    sim: 'Classic Chrome',
  },
  {
    id: 'red-sun', needs: ['smoke'], site: null, sessions: ['morning', 'evening'], avoid: WET, timing: 'glow', weight: 0.7,
    place: 'anywhere with the sun behind a landmark: Baker Beach in the evening, Hawk Hill in the morning',
    shot: 'The sun as a red disc behind a bridge tower or a passing ship. Expose for the disc and let the rest go dark.',
    kit: '{tele} at 230mm, f/8, about two stops under',
    sim: 'Classic Chrome',
  },

  // Moon
  {
    id: 'moonrise-city', needs: ['moonrise'], site: 'twin-peaks', sessions: ['evening'], avoid: WET, timing: 'phenomenon', weight: 0.9,
    place: 'Twin Peaks, or the Marin Headlands looking back at the city',
    shot: 'The moon lifting behind the skyline while the buildings still hold dusk light. Line it up on the given bearing before it rises.',
    kit: '{tele} at 230mm, tripod, about 1/60 s at f/8, ISO 400; shutter faster as the sky darkens',
    sim: 'Classic Chrome',
  },
  {
    id: 'moonset-dawn', needs: ['moonset'], site: null, sessions: ['morning'], avoid: WET, timing: 'phenomenon', weight: 0.85,
    place: 'anywhere east of a landmark on the given bearing: the Embarcadero, or Crissy Field for the bridge',
    shot: 'The moon going down behind Sutro Tower or the bridge towers in the pink band of dawn.',
    kit: '{tele} at 230mm, tripod, about 1/60 s at f/8, ISO 400',
    sim: 'Classic Chrome',
  },
  {
    id: 'crescent', needs: ['crescent'], site: null, sessions: ['morning', 'evening'], avoid: WET, timing: 'blue', weight: 0.55,
    place: 'any open horizon on the given bearing',
    shot: 'A thin crescent in the colour band, with a clean silhouette under it: a tower, a cypress, a figure.',
    kit: '{short_tele} or {tele}, tripod, about 1 s at f/4, ISO 800',
    sim: 'Velvia',
  },
  {
    id: 'snow-peaks', needs: ['snow'], site: 'twin-peaks', sessions: ['morning', 'evening'], avoid: WET, timing: 'golden', weight: 0.8,
    place: 'Twin Peaks or Grand View Park',
    shot: 'Snow on Mount Diablo or Mount Hamilton behind the skyline. Rare; the low sun turns it pink.',
    kit: '{tele} at 230mm, f/8',
    sim: 'Classic Chrome',
  },

  // Light without drama
  {
    id: 'rays', needs: ['rays'], site: 'twin-peaks', sessions: ['morning', 'evening'], avoid: WET, timing: 'golden', weight: 0.6,
    place: 'Twin Peaks or Grand View Park',
    shot: 'Shafts of light fanning over the city or the ocean. Underexpose a stop so the beams hold.',
    kit: '{tele} at 50 to 120mm',
    sim: 'Acros with the red filter, or Classic Chrome',
  },
  {
    id: 'soft-steps', needs: ['soft-light'], site: null, sessions: ['morning', 'evening'], avoid: WET, timing: 'session', weight: 0.5,
    place: 'the 16th Avenue Tiled Steps and Hidden Garden Steps, or a street walk in the Mission or Chinatown',
    shot: 'Shadowless light: mosaic colour at full saturation, or faces and shopfronts without hard contrast.',
    kit: '{normal} or {compact}',
    sim: 'Reala Ace for colour, Acros for the street',
  },
  {
    id: 'hard-light-street', needs: ['clean-light'], site: null, sessions: ['evening'], avoid: WET, timing: 'golden', weight: 0.5,
    place: 'the Mission, North Beach, or the 16th Avenue Tiled Steps (they face the low sun)',
    shot: 'Long shadows and warm side-light: figures crossing bars of light, stair risers glowing. Expose for the highlights.',
    kit: '{normal} or {short_tele}, minus two thirds of a stop',
    sim: 'Classic Chrome',
  },
  {
    id: 'first-light-street', needs: ['clean-light'], site: null, sessions: ['morning'], avoid: WET, timing: 'golden', weight: 0.5,
    place: 'the Embarcadero and Ferry Building, then North Beach and Chinatown',
    shot: 'First sun on the waterfront and long shadows down the streets as the city starts up.',
    kit: '{compact} or {normal}',
    sim: 'Classic Chrome',
  },
  {
    id: 'blue-hour-city', needs: ['clean-light', 'crystal-air'], site: 'twin-peaks', sessions: ['evening'], avoid: WET, timing: 'blue', weight: 0.5,
    place: 'Twin Peaks',
    shot: 'Blue hour over the city: Market Street as a line of light to the Bay Bridge.',
    kit: '{compact} or {tele}, tripod, f/8, 4 to 15 s',
    sim: 'Classic Chrome',
  },
];

// Framing for the colour score at each site, by session.
export const COLOR_FRAMES = {
  'ocean-beach': { evening: { shot: 'Colour doubled in the wet sand at the waterline; surfers and walkers in silhouette.', kit: '{wide} low to the sand, or {short_tele} for figures', sim: 'Velvia' } },
  'lands-end': { evening: { shot: 'Sutro Baths ruins in the foreground with the colour over the Pacific; Seal Rocks to the south.', kit: '{wide}, tripod once the sun is down', sim: 'Velvia' } },
  'baker-beach': { evening: { shot: 'The bridge catching the last warm light, waves as leading lines. Walk north for a lower angle on the towers.', kit: '{compact} or {wide}; {tele} for the towers alone', sim: 'Classic Chrome' } },
  'twin-peaks': {
    evening: { shot: 'The whole sky over the city, then Market Street lighting up into blue hour.', kit: '{wide} for sky, {tele} for downtown; tripod', sim: 'Velvia' },
    morning: { shot: 'The sun coming up behind downtown and the Bay Bridge, towers in silhouette against the colour.', kit: '{tele} at 100 to 230mm', sim: 'Classic Chrome' },
  },
  'hawk-hill': {
    evening: { shot: 'The bridge lit from the west with the city glowing behind it; the sky does the rest.', kit: '{tele} at 60 to 120mm, or {wide} for the full sweep', sim: 'Velvia' },
    morning: { shot: 'First light behind the city, the bridge in silhouette, colour reflected in the Bay.', kit: '{tele} at 80 to 160mm, tripod before sunrise', sim: 'Classic Chrome' },
  },
  'grand-view': {
    evening: { shot: 'The avenues running to the ocean under the colour; the 16th Avenue Tiled Steps are just below for the last light.', kit: '{short_tele} or {tele}', sim: 'Classic Neg' },
    morning: { shot: 'Downtown and Sutro Tower against a pink eastern sky, Golden Gate Park in shadow below.', kit: '{tele}', sim: 'Classic Chrome' },
  },
  'mount-tam': {
    evening: { shot: 'Ridge after ridge falling to the Pacific under the colour.', kit: '{tele} for layers, {wide} for the sky', sim: 'Velvia' },
    morning: { shot: 'The Bay and the city far below as the east lights up; ridges in blue shadow.', kit: '{tele}', sim: 'Classic Chrome' },
  },
  embarcadero: { morning: { shot: 'The Bay Bridge in silhouette against the sunrise, Pier 14 railings leading in.', kit: '{compact} or {wide}, tripod before sunrise', sim: 'Velvia' } },
};
