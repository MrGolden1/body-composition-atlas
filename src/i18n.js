// English / Persian strings. Persian switches the whole layout to right-to-left and uses
// Persian digits; numbers themselves are never changed.

const STR = {
  en: {
    brand: 'Body Composition Atlas', brandSub: '3D progress review',
    male: 'Male', cm: 'cm', ageN: (n) => `age ${n}`,
    measurements: 'Measurements', kgFat: (pbf) => `kg · ${pbf}% fat`,
    compareAgainst: 'Compare against', changeColours: 'Change colours',
    display: 'Display', exaggerate: 'Exaggerate differences', exaggerateHint: 'Visual emphasis only — all numbers stay exact.',
    labels: 'Segment labels', turntable: 'Turntable', shorts: 'Fitted shorts',
    camera: 'Camera', front: 'Front', side: 'Side', back: 'Back', three: '¾', saveImage: 'Save image',
    hint: 'Drag to orbit · scroll or pinch to zoom · right-drag to pan. Left/right are the person’s anatomical left/right.',
    views: { body: 'Body', fat: 'Fat map', tissue: 'Tissue', compare: 'Compare' },
    tissue: 'Tissue view', modes: { xray: 'X-ray', cut: 'Cutaway', slice: 'Slice' },
    layers: 'Layers', layerFat: 'Skin & fat', layerMuscle: 'Lean / muscle', layerVisc: 'Visceral fat',
    cutDepth: 'Cut depth', sliceHeight: 'Slice height', atNavel: 'navel', front_: 'front', back_: 'back', feet: 'feet', head: 'head',
    tissueHint: {
      xray: 'Translucent fat over the lean body. Turn layers off to see each one on its own.',
      cut: 'The near half is cut away so the layers show in section. Orbit to cut from any side.',
      slice: 'A horizontal slice, like a CT image. Drag the slider to move it up and down the body.',
    },
    metrics: {
      weight: 'Weight', bfm: 'Body fat mass', pbf: 'Body fat', smm: 'Skeletal muscle', bmi: 'BMI',
      bmr: 'Basal metabolic rate', vfa: 'Visceral fat area', tbw: 'Total body water', ecwTbw: 'ECW / TBW', score: 'Device score',
    },
    units: { kg: 'kg', '%': '%', 'kg/m²': 'kg/m²', kcal: 'kcal', 'cm²': 'cm²', L: 'L', '': '', '/100': '/100' },
    ref: 'ref', notMeasured: 'Not measured', est: 'est.',
    seg: { la: 'Left arm', ra: 'Right arm', tr: 'Trunk', ll: 'Left leg', rl: 'Right leg' },
    fat: 'Fat', lean: 'Lean',
    changeVsPrev: 'change vs previous test', changeVs: (b) => `change vs ${b}`,
    scoreNames: { 'Fitness score': 'Fitness score', 'InBody score': 'InBody score', 'Anea score': 'Anea score' },
    segmental: 'Segmental analysis', segment: 'Segment', fatKg: 'Fat kg', leanKg: 'Lean kg', fatShare: 'Fat share',
    xsTitle: 'Abdominal cross-section', schematic: 'schematic', anterior: 'ANTERIOR', posterior: 'POSTERIOR',
    xsSubcut: 'Subcutaneous fat', xsLean: 'Lean wall & organs', xsVisc: 'Visceral fat', xsThresh: '100 cm² threshold',
    xsNone: 'Visceral fat not measured in this test',
    progress: 'Progress', weight: 'Weight', bfmLong: 'Body fat mass', smmLong: 'Skeletal muscle mass', overall: 'overall',
    notesTitle: 'Reading notes',
    notes: [
      'Tests 1–2 were measured on an InBody device and Test 3 on an Anea BIA 1204. Trust the direction of change more than exact decimals, especially for skeletal muscle.',
      'Test 2’s device clock was wrong (printed 2010.01.01), so its date is unknown. Tests are ordered by body weight.',
      'The 3D body is a real human base mesh whose segment volumes are calibrated to the measured fat and lean mass of each segment (fat 0.90 kg/L, lean 1.10 kg/L).',
      'Visceral fat area for Test 2 is estimated from its level (17 ≈ 170 cm²); Test 1 has no visceral measurement.',
      'This is a visualisation of BIA estimates, not a body scan.',
    ],
    play: 'Play progression', pause: 'Pause',
    legendFat: 'Regional fat share', legendFatSub: 'fat ÷ (fat + lean) per segment', notDriven: 'Head: not measured',
    legendChange: (b) => `Change in segment fat vs ${b}`, ghost: (b) => `Ghost = ${b} body shape`,
    legendTissue: 'Tissue layers', lgSkinFat: 'Skin & subcutaneous fat', lgLean: 'Lean tissue (muscle & organs)', lgVisc: 'Visceral fat',
    loading: 'Building body…', language: 'فارسی', langCode: 'FA',
    menu: 'Details', overview: 'Overview', panels: { left: 'Controls', right: 'Results' },
  },
  fa: {
    brand: 'اطلس ترکیب بدن', brandSub: 'مرور سه‌بعدی پیشرفت',
    male: 'مرد', cm: 'سانتی‌متر', ageN: (n) => `${n} ساله`,
    measurements: 'اندازه‌گیری‌ها', kgFat: (pbf) => `کیلوگرم · ${pbf}٪ چربی`,
    compareAgainst: 'مقایسه با', changeColours: 'رنگ‌بندی تغییرات',
    display: 'نمایش', exaggerate: 'بزرگ‌نمایی تفاوت‌ها', exaggerateHint: 'فقط تأکید بصری است — همه اعداد دقیق می‌مانند.',
    labels: 'برچسب نواحی', turntable: 'چرخش خودکار', shorts: 'شلوارک ورزشی',
    camera: 'دوربین', front: 'جلو', side: 'پهلو', back: 'پشت', three: 'سه‌رخ', saveImage: 'ذخیره تصویر',
    hint: 'برای چرخاندن بکشید · برای بزرگ‌نمایی اسکرول یا دو انگشت · با کلیک راست جابه‌جا کنید. چپ و راست، چپ و راستِ خودِ فرد است.',
    views: { body: 'بدن', fat: 'نقشه چربی', tissue: 'بافت‌ها', compare: 'مقایسه' },
    tissue: 'نمای بافت', modes: { xray: 'شفاف', cut: 'برش طولی', slice: 'برش عرضی' },
    layers: 'لایه‌ها', layerFat: 'پوست و چربی', layerMuscle: 'بافت بدون چربی / عضله', layerVisc: 'چربی احشایی',
    cutDepth: 'عمق برش', sliceHeight: 'ارتفاع برش', atNavel: 'ناف', front_: 'جلو', back_: 'پشت', feet: 'پا', head: 'سر',
    tissueHint: {
      xray: 'چربیِ نیمه‌شفاف روی بدنِ بدون چربی. با خاموش کردن لایه‌ها هر کدام را جداگانه ببینید.',
      cut: 'نیمه نزدیک برداشته شده تا لایه‌ها در برش دیده شوند. با چرخاندن، از هر طرف برش بزنید.',
      slice: 'برش افقی، مانند تصویر سی‌تی‌اسکن. با اسلایدر برش را بالا و پایین ببرید.',
    },
    metrics: {
      weight: 'وزن', bfm: 'توده چربی بدن', pbf: 'درصد چربی', smm: 'عضله اسکلتی', bmi: 'شاخص توده بدن',
      bmr: 'متابولیسم پایه', vfa: 'سطح چربی احشایی', tbw: 'آب کل بدن', ecwTbw: 'نسبت آب برون‌سلولی', score: 'امتیاز دستگاه',
    },
    units: { kg: 'کیلوگرم', '%': '٪', 'kg/m²': 'kg/m²', kcal: 'کیلوکالری', 'cm²': 'cm²', L: 'لیتر', '': '', '/100': '/۱۰۰' },
    ref: 'مرجع', notMeasured: 'اندازه‌گیری نشده', est: 'تخمینی',
    seg: { la: 'دست چپ', ra: 'دست راست', tr: 'تنه', ll: 'پای چپ', rl: 'پای راست' },
    fat: 'چربی', lean: 'بدون چربی',
    changeVsPrev: 'تغییر نسبت به تست قبلی', changeVs: (b) => `تغییر نسبت به ${b}`,
    scoreNames: { 'Fitness score': 'امتیاز تناسب', 'InBody score': 'امتیاز InBody', 'Anea score': 'امتیاز Anea' },
    segmental: 'تحلیل نواحی بدن', segment: 'ناحیه', fatKg: 'چربی', leanKg: 'بدون چربی', fatShare: 'سهم چربی',
    xsTitle: 'برش عرضی شکم', schematic: 'شماتیک', anterior: 'جلو', posterior: 'پشت',
    xsSubcut: 'چربی زیرپوستی', xsLean: 'دیواره عضلانی و اندام‌ها', xsVisc: 'چربی احشایی', xsThresh: 'آستانه ۱۰۰ cm²',
    xsNone: 'چربی احشایی در این تست اندازه‌گیری نشده',
    progress: 'روند پیشرفت', weight: 'وزن', bfmLong: 'توده چربی بدن', smmLong: 'توده عضله اسکلتی', overall: 'در کل',
    notesTitle: 'نکته‌ها',
    notes: [
      'تست‌های ۱ و ۲ با دستگاه InBody و تست ۳ با Anea BIA 1204 انجام شده‌اند. به جهتِ تغییرات بیشتر از اعشار دقیق اعتماد کنید، به‌ویژه در عضله اسکلتی.',
      'ساعت دستگاه در تست ۲ اشتباه بوده (۲۰۱۰٫۰۱٫۰۱ چاپ شده)، پس تاریخ آن نامشخص است. تست‌ها بر اساس وزن مرتب شده‌اند.',
      'بدن سه‌بعدی یک مدل واقعی انسان است که حجم هر ناحیه‌اش با چربی و بافت بدون چربیِ اندازه‌گیری‌شده همان ناحیه کالیبره شده است (چربی ۰٫۹۰ و بدون چربی ۱٫۱۰ کیلوگرم بر لیتر).',
      'سطح چربی احشایی تست ۲ از روی سطح آن تخمین زده شده (۱۷ ≈ ۱۷۰ cm²)؛ تست ۱ اندازه‌گیری احشایی ندارد.',
      'این مدل تجسمی از برآوردهای BIA است، نه اسکن بدن.',
    ],
    play: 'پخش روند', pause: 'توقف',
    legendFat: 'سهم چربی هر ناحیه', legendFatSub: 'چربی ÷ (چربی + بدون چربی) در هر ناحیه', notDriven: 'سر: اندازه‌گیری نمی‌شود',
    legendChange: (b) => `تغییر چربی نواحی نسبت به ${b}`, ghost: (b) => `سایه = فرم بدن در ${b}`,
    legendTissue: 'لایه‌های بافت', lgSkinFat: 'پوست و چربی زیرپوستی', lgLean: 'بافت بدون چربی (عضله و اندام‌ها)', lgVisc: 'چربی احشایی',
    loading: 'در حال ساخت بدن…', language: 'English', langCode: 'EN',
    menu: 'جزئیات', overview: 'نمای کلی', panels: { left: 'تنظیمات', right: 'نتایج' },
  },
};

const read = () => {
  try {
    const q = new URLSearchParams(location.search).get('lang');
    if (q === 'fa' || q === 'en') return q;
    const s = localStorage.getItem('bca-lang');
    if (s === 'fa' || s === 'en') return s;
  } catch { /* storage unavailable */ }
  return 'en';
};

export let lang = read();
export const t = () => STR[lang];

export function setLang(l) {
  lang = l;
  try { localStorage.setItem('bca-lang', l); } catch { /* ignore */ }
  applyDocLang();
}

export function applyDocLang() {
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'fa' ? 'rtl' : 'ltr';
  document.title = STR[lang].brand;
}

// number formatting: fixed decimals, Persian digits in Persian mode
export function num(v, dec = 1) {
  if (v == null || Number.isNaN(v)) return '—';
  const s = Number(v).toFixed(dec);
  if (lang !== 'fa') return s;
  return s.replace(/[0-9]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d]).replace('.', '٫').replace('-', '−');
}

// digits only (for strings like "Test 3")
export const digits = (s) => (lang === 'fa' ? String(s).replace(/[0-9]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d]) : String(s));

// per-test labels
export function testLabel(test, key) {
  if (lang === 'fa' && test.fa && test.fa[key] != null) return test.fa[key];
  return test[key];
}
