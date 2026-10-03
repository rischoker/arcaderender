// Lectura cualitativa del desempeño de cada estudiante: rango, fortalezas, debilidades y consejos.
// Compartido entre el servidor (que lo calcula) y las pantallas (que lo muestran).
(function (root) {
  // Rangos medievales. La línea de aprobación de la academia es 80% → "Knight".
  const RANKS = [
    { min: 95, icon: '🧙', title: 'Grand Archmage', line: 'A true master of English. The whole kingdom bows to you.' },
    { min: 90, icon: '👑', title: 'Champion of the Realm', line: 'Outstanding! You led the defense with skill and precision.' },
    { min: 80, icon: '⚔️', title: 'Knight of the Castle', line: 'You passed the exam. A worthy defender of the castle.' },
    { min: 70, icon: '🛡️', title: 'Squire', line: 'Very close to knighthood. A little more practice and you will pass.' },
    { min: 60, icon: '🔨', title: 'Apprentice Smith', line: 'You are forging your skills. Keep training the weak spots.' },
    { min: 40, icon: '📜', title: 'Page', line: 'You are learning the basics of the trade. Review and try again.' },
    { min: 0, icon: '🌾', title: 'Village Recruit', line: 'Every hero starts somewhere. Study the topics below and come back stronger.' },
  ];

  // Consejos por tipo de pregunta (clave de la parte del examen)
  const TIPS = {
    vocab: { good: 'Strong everyday vocabulary', tip: 'Learn new words in groups (food, family, places) and say them out loud.' },
    grammar: { good: 'Solid grammar', tip: 'Review the basic structures: to be, have got, present simple, past simple and prepositions.' },
    sign: { good: 'Reads signs and notices well', tip: 'Ask yourself: where would I see this sign, and what does it ask me to do?' },
    reply: { good: 'Natural in short conversations', tip: 'Practise common replies: "Here you are", "Never mind", "Sure, no problem".' },
    read: { good: 'Good reading for detail', tip: 'Underline names, numbers and times before answering.' },
    cloze: { good: 'Chooses the right word in context', tip: 'Read the whole sentence first and look at the words around the gap (collocations like make/do, take/have).' },
    verbs: { good: 'Knows verb forms', tip: 'Make flashcards with irregular verbs (go–went–gone) and verb patterns (enjoy + -ing, want + to).' },
    message: { good: 'Understands short messages', tip: 'Find the purpose of the message: is the writer inviting, asking, changing a plan or apologising?' },
    open: { good: 'Strong with small grammar words', tip: 'Review linkers and prepositions: since/for, although/despite, so/such, in case, unless.' },
    phrasal: { good: 'Good with phrasal verbs', tip: 'Learn phrasal verbs in sentences, grouped by particle (up, off, out) and write your own examples.' },
    tenses: { good: 'Uses tenses accurately', tip: 'Draw a timeline for each tense; review conditionals, passives and reported speech.' },
    compare: { good: 'Comfortable with comparisons', tip: 'Review -er/-est vs more/most, irregular forms (good–better–best) and "as … as".' },
    p1: { good: 'Strong collocations', tip: 'Keep a collocation notebook: make a decision, pay attention, take into account…' },
    p2: { good: 'Strong open cloze skills', tip: 'Look for fixed expressions and inversions (no sooner … than, hardly … when, let alone).' },
    p3: { good: 'Good word formation', tip: 'Study prefixes and suffixes: un-/in-/dis-, -tion, -ness, -ful, -less, -ive, -ly.' },
    p4: { good: 'Handles key word transformations', tip: 'Learn the typical changes: active ↔ passive, wish/rather, reported speech, modal perfects.' },
    idiom: { good: 'Knows idiomatic English', tip: 'Learn idioms with a picture or a story in your head, and use one each day.' },
  };

  function build(r) {
    const total = r.correct + r.wrong + r.timeout;
    const acc = total ? r.correct / total * 100 : 0;
    const rank = total >= 3 ? RANKS.find(k => acc >= k.min) : { icon: '🕯️', title: 'Watchman', line: 'Too few answers to judge. Join the next battle from the start!' };
    const parts = (r.parts || []).filter(p => p.n >= 2).map(p => ({ ...p, acc: p.ok / p.n }));
    const strengths = [], weaknesses = [], tips = [];
    parts.slice().sort((a, b) => b.acc - a.acc || b.n - a.n).filter(p => p.acc >= 0.8).slice(0, 2)
      .forEach(p => strengths.push((TIPS[p.key] && TIPS[p.key].good) || 'Good at ' + p.name));
    parts.slice().sort((a, b) => a.acc - b.acc || b.n - a.n).filter(p => p.acc < 0.6).slice(0, 2)
      .forEach(p => { weaknesses.push(p.name.replace(/^.*· /, '')); if (TIPS[p.key]) tips.push(TIPS[p.key].tip); });
    // hábitos al responder
    const avgRatio = r.timeRatio ?? null;
    if (r.best >= 6) strengths.push(`Great focus: ${r.best} correct answers in a row`);
    if (r.goldenOk >= 1) strengths.push(r.goldenOk > 1 ? `Solved ${r.goldenOk} golden questions (written answers)` : 'Solved a golden question (written answer)');
    if (avgRatio != null && avgRatio < 0.4 && acc >= 80) strengths.push('Quick and accurate decisions');
    if (r.timeout >= 3 && r.timeout >= total * 0.2) { weaknesses.push('Ran out of time often'); tips.push('Read the question first, find the key word, then look at the options.'); }
    if (avgRatio != null && avgRatio < 0.3 && acc < 60) { weaknesses.push('Answers too fast'); tips.push('Slow down: read every option before choosing.'); }
    if (r.golden >= 2 && r.goldenOk === 0) { weaknesses.push('Written answers (spelling)'); tips.push('Practise spelling the words you learn: write them, don’t only read them.'); }
    if (!strengths.length) strengths.push(acc >= 50 ? 'Kept trying under pressure' : 'Took part in the defense');
    if (!tips.length) tips.push(acc >= 90 ? 'Challenge yourself with the next level.' : 'Review the questions you missed and try the same level again.');
    return { rank: { icon: rank.icon, title: rank.title, line: rank.line }, strengths: strengths.slice(0, 3), weaknesses: weaknesses.slice(0, 3), tips: tips.slice(0, 2), accuracy: Math.round(acc), passed: acc >= 80 };
  }

  const api = { build, RANKS, PASS: 80 };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.FEEDBACK = api;
})(typeof self !== 'undefined' ? self : this);
