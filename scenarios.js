/* The nine scenarios. A = express, B = suppress, C = dismiss, every time.
   `rgb` drives the colour on both the form and the projection.
   `bed` names which ambience file plays. Version A only. */

const SCENARIOS = [
  { emotion:'Grief',       rgb:'92, 92, 196',   bed:'ocean',
    text:'You receive a text from your mum telling you that your family pet has passed away. You\u2019re at university working on a group project with your classmates.',
    a:'Tell your group members what happened and openly express how you feel.',
    b:'Excuse yourself and go somewhere private to express your sadness.',
    c:'Dismiss your emotions and continue working on the project.' },

  { emotion:'Pride',       rgb:'240, 169, 59',  bed:'forest',
    text:'You\u2019ve just found out that you have won an award recognising your hard work.',
    a:'Express your gratitude and happiness about being recognised.',
    b:'Celebrate privately, as you see it as a personal achievement.',
    c:'Downplay the achievement and continue working.' },

  { emotion:'Achievement', rgb:'255, 122, 46',  bed:'fire',
    text:'You\u2019ve been working towards a personal best at the gym for months and have finally achieved it.',
    a:'Celebrate your achievement and let yourself enjoy the moment.',
    b:'Keep your emotions to yourself and wait until you\u2019re home.',
    c:'Brush it off and focus on setting your next personal best.' },

  { emotion:'Pain',        rgb:'255, 92, 61',   bed:'fire',
    text:'You\u2019re walking through a crowded area when you trip and fall, scraping your arm and causing yourself pain.',
    a:'Cry or openly express your pain and ask someone nearby for help.',
    b:'Stay composed in public, then express your emotions somewhere private.',
    c:'Hide your pain and act as though nothing happened.' },

  { emotion:'Calm',        rgb:'79, 194, 168',  bed:'forest',
    text:'You and your friends go on a hike and discover a quiet spot with a beautiful view. Your friends are excited and enjoying the peaceful atmosphere.',
    a:'Enjoy the moment and openly express your happiness and sense of calm.',
    b:'Appreciate the moment but keep your feelings of calm and happiness to yourself.',
    c:'Remain quiet and emotionally neutral, focusing on continuing the hike.' },


  { emotion:'Pride',       rgb:'227, 154, 164', bed:'wind',
    text:'You receive a compliment on an outfit you feel really proud of.',
    a:'Say thank you and openly share your excitement about the outfit and how it makes you feel.',
    b:'Say thank you but keep the conversation brief, saving your excitement to express privately later.',
    c:'Politely say thank you, brushing off the compliment as you don\u2019t see it as anything worth celebrating.' },

  { emotion:'Anger',       rgb:'232, 51, 43',   bed:'fire',
    text:'Your co-worker has taken credit for work that you completed.',
    a:'Openly express your frustration and address the situation with your co-worker.',
    b:'Say nothing at work and process your frustration privately through journaling, talking to someone or self-reflection.',
    c:'Dismiss your frustration and continue with your work without addressing it.' },

  { emotion:'Jealousy',    rgb:'201, 217, 59',  bed:'forest',
    text:'You and a colleague have both been nominated for Employee of the Month. You feel you have worked extremely hard for the recognition, but you\u2019re concerned your colleague may have an advantage through their industry connections.',
    a:'Express your frustration or jealousy openly, discussing why you feel the situation is unfair.',
    b:'Say nothing at work but privately process your feelings later.',
    c:'Dismiss your frustration and try not to think about the outcome.' },

  { emotion:'Joy',         rgb:'255, 210, 74',  bed:'wind',
    text:'You went to a friend\u2019s birthday party alone and feel nervous because you don\u2019t know anyone. When you arrive, you instantly make a new friend.',
    a:'Smile and openly show your happiness about making a new friend.',
    b:'Keep your excitement to yourself because you don\u2019t want to seem socially awkward, and express your happiness later in private.',
    c:'Brush it off as if it is no big deal.' }
];

/* ==========================================================================
   THE TIE BREAKER

   The last screen tells the visitor which of the three they are most likely
   to do, so nine answers can now come out level at the top: 4 v 4 v 1, or
   3 v 3 v 3. The laptop checks this the moment the ninth answer is in, before
   anything plays, and if it is a tie it asks this one extra question.

   Only the options that were tied are shown. 4 v 4 v 1 gets two options,
   3 v 3 v 3 gets all three. That means this single question always settles
   it and there is never a second tie.

   Reword it freely. It is only ever read from here.
   ========================================================================== */

const TIEBREAKER = { emotion:'Grief', rgb:'92, 92, 196', bed:'ocean',
  text:'A close family member has been involved in an accident and passed away. You live interstate and will be travelling home to be with your family in the next few days.',
  a:'Express your emotions openly, regardless of whether you are alone or with family. You can\u2019t control when you are upset, so you don\u2019t hide the emotions.',
  b:'Allow yourself to grieve privately before travelling, so you can stay strong for your family.',
  c:'Keep yourself busy with arrangements, work and responsibilities to avoid confronting your emotions.' };

/* true:  the tie breaker plays as a tenth segment of the film, in its colour.
   false: it only counts towards the results and the film stays at nine. */
const TIEBREAK_IN_FILM = true;

/* Shared by both pages, so the laptop and the wall always agree on what
   counts as a tie. */
const BEHAVIOURS = ['express', 'suppress', 'dismiss'];

function countAnswers(list) {
  const c = { express: 0, suppress: 0, dismiss: 0 };
  list.forEach(a => { if (c[a] !== undefined) c[a]++; });
  return c;
}

/* every behaviour sitting on the top count. One name means a clear winner,
   two or three means a tie. */
function leadersOf(list) {
  const c = countAnswers(list);
  const top = Math.max(c.express, c.suppress, c.dismiss);
  return BEHAVIOURS.filter(b => c[b] === top);
}

/* the scenarios the film actually plays for this list of answers */
function filmScenes(list) {
  return (TIEBREAK_IN_FILM && list.length > SCENARIOS.length)
    ? SCENARIOS.concat([TIEBREAKER])
    : SCENARIOS;
}

const CHANNEL      = 'boxed-reflection';
const SEGMENT_MS   = 5000;
const NEUTRAL_RGB  = '255, 122, 46';
