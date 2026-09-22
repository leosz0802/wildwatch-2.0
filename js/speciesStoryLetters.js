// 三物种试点：信件依据真实状态选段，动物与游客分别提供感官和现场观察。
const STORIES = {
  鹿: { id: 'deer_water', name: '泥岸上的第一串脚印', metric: 'water', target: 65, action: 'habitat', label: '去修复水源',
    opening: ['风先到了，狼的气味随后才到。', '我停在泥岸上，耳朵转向身后的草。幼鹿还想往前走，水就在几步之外；可是喝水必须低头，低头就看不见岸上的动静。狼也要活下去。真正把我们困住的，是所有脚印都通向这一个水口。'],
    pressure: ['昨夜，我们把饮水的时间往后推了一次。', '天黑以后，岸边仍有脚步。等到能够低头，幼鹿已经跟不上队伍。饥饿的狼不会读懂你的界桩，口渴的鹿也不会因为游线开放就冒险过河。请看看那条堵住的支流：如果水能在那里留下，我们就不必在这里挤成一团。'],
    recovery: ['今天的水在另一处泥岸留下了气味。', '我没有立刻过去。先听，抬头，再走两步。幼鹿跟着我低下头，又很快抬起来。狼的气味仍在风里，但这次我们有了绕开的地方。你没有替我们赢过狼；你让一次低头，不再必须赌上整条退路。'],
    visitor: ['我等了很久，鹿始终没有饮水。镜头里的停顿，原来不是它在摆姿势。向导让我们退到上风口之外，给岸边留下安静。', '水口还是拥挤。我们缩短了停留，幼鹿几次抬头后退；我更愿意下次看见一条能让它们自行选择的水线。', '今天我看见幼鹿在另一处低下了头。没有人投食，也没有人赶动物过来。水线分开以后，观察才有了真正的意义。'] },
  乌鸦: { id: 'crow_tracks', name: '它记住了那辆车', metric: 'safety', target: 70, action: 'houndScout', label: '去调查脚印',
    opening: ['树下那个人第二次出现时，我先叫了。', '我认得他靠近时抬头的样子。我们会记住危险的脸，也会跟着同伴的警叫离开。路边有肉味，却没有可以安心落脚的位置。食物不是每次都值得靠近；我在枝头等，你能不能先看一眼下面？'],
    pressure: ['今天，别的乌鸦也没有落下去。', '一只年轻的同伴试着靠近，我叫，它停住，又换到更远的树上。肉味还在。我们吃种子、昆虫，也寻找腐食，但我们不会知道草里那段金属是做什么的。你还没查明的东西，正在把整片觅食地变成必须绕开的地方。'],
    recovery: ['那段路今天安静了些，我仍然没有立刻下树。', '同伴先试探，我等它抬头，再落到旁边。我们的警惕不会随一张结案纸消失；可是每一次没有危险的落地，都会改变下一次选择。请继续看住那条路。我们记得危险，也会慢慢记住哪里能够回来。'],
    visitor: ['乌鸦连续报警，我们停止靠近路边的诱饵。它的叫声不是案件结论，却值得安排一次调查。', '观鸟点暂时绕行。鸟没有配合我们的行程，但危险没有查清以前，绕路比再靠近一步更好。', '乌鸦又开始试探落地。向导没有把安全改善说成永远安全；这让我更相信这里的观察记录。'] },
  斑马: { id: 'zebra_tail', name: '队尾还有一个位置', metric: 'grass', target: 65, action: 'habitat', label: '去恢复草场',
    opening: ['队伍转弯时，我停下来等了一声回答。', '幼驹叫了，母马回头。我们靠声音和气味认出彼此；远处的野犬还在移动，不能把每一次停顿都拖得太久。粗草也能吃，可这一段越来越短的草，逼着我们不断向前。路如果被游车截住，最小的那一个就得独自追上来。'],
    pressure: ['今天，队尾和队首之间多了一段空地。', '母马想停，前面的同伴还在走。野犬沿着边缘寻找机会，那是它们的生计；我们需要的不是让猎手消失，而是一条不会被反复打断的通道。草不够，我们就继续走。请别等到看不见条纹，才发现这片地留不住我们。'],
    recovery: ['母马回头时，幼驹就在身旁。', '这一段路没有车横过来，草也能让我们多停一会儿。有人吃草，有人抬头；远处的猎手没有消失，队伍却不必被迫拉长。我们暂时留下。留下不是承诺，是今天的草、水和退路一起给出的答案。'],
    visitor: ['游车停下来让斑马先过。幼驹循着母马的叫声追上去，我才看懂队尾那一点距离有多重要。', '今天没有追着迁出的斑马拍照。草场和通道需要恢复，追逐只会让它们走得更远。', '我们从固定观察点看斑马吃草。最好的变化不是它们靠得更近，而是队伍终于不用一直走。'] }
};
function storyView(reserve, species, previous) {
  const story = STORIES[species]; if (!story) return null;
  const value = Number(story.metric === 'safety' ? reserve.safety : (reserve.ecology || {})[story.metric]) || 0;
  const phase = value >= story.target ? (previous ? 'recovery' : 'opening') : previous ? 'pressure' : 'opening';
  return { story, phase, value, paragraphs: story[phase], key: `${story.id}:${phase}` };
}
function animalStoryLetter(reserve, letter, history) {
  const previous = history.find(item => item.species === letter.species && item.storyId);
  const view = storyView(reserve, letter.species, previous); if (!view) return letter;
  if (history.some(item => item.storyId === view.story.id && item.storyPhase === view.phase)) return letter;
  return Object.assign({}, letter, { storyId: view.story.id, storyPhase: view.phase });
}
function visitorStoryLetter(reserve, day, history) {
  const ecology = reserve.ecology || {};
  for (const species of Object.keys(STORIES)) {
    const key = { 鹿: 'deer', 乌鸦: 'crow', 斑马: 'zebra' }[species];
    if (!Number((ecology.herbivores || {})[key] || (ecology.birds || {})[key])) continue;
    const prior = history.find(item => item.id && item.id.startsWith(`vs_${key}_`));
    const view = storyView(reserve, species, prior);
    const id = `vs_${key}_${view.phase}`;
    if (history.some(item => item.id === id)) continue;
    return { id, day, readAt: 0, title: `游客手记 · ${species}`, body: view.story.visitor[{opening:0,pressure:1,recovery:2}[view.phase]], trouble: view.phase === 'pressure' };
  }
  return null;
}
module.exports = { STORIES, animalStoryLetter, visitorStoryLetter };
