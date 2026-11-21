const sections = [...document.querySelectorAll('.collection')].map(element => ({
  element,
  grid: element.querySelector('.dictionary-grid'),
  navLink: document.querySelector(`.section-nav a[href="#${element.id}"]`),
  cards: []
}));
const toolbar = document.getElementById('catalog-toolbar');
const search = document.getElementById('dictionary-search');
const status = document.getElementById('catalog-status');
const template = document.getElementById('dictionary-card');
const exampleDialog = document.getElementById('example-dialog');
const exampleDictionary = document.getElementById('example-dictionary');
const exampleTerm = document.getElementById('example-term');
const exampleReading = document.getElementById('example-reading');
const exampleFields = document.getElementById('example-fields');
const exampleSource = document.getElementById('example-source');
const definitionLabels = {
  monolingual: 'Monolingual',
  bilingual: 'Bilingual',
  both: 'Monolingual + bilingual',
  frequency: 'Frequency only'
};

async function fetchJson(url) {
  const response = await fetch(url, { cache: 'no-cache' });
  if (!response.ok) {
    throw new Error(`${url} returned HTTP ${response.status}`);
  }
  return response.json();
}

function link(text, url, dictionaryTitle) {
  const element = document.createElement('a');
  element.href = url;
  element.textContent = text;
  element.setAttribute('aria-label', `${text} · ${dictionaryTitle}`);
  return element;
}

function showExample(dictionary) {
  const { example } = dictionary;
  exampleDialog.dataset.category = dictionary.category;
  exampleDictionary.textContent = dictionary.title;
  exampleTerm.textContent = example.term;
  exampleTerm.lang = example.lang ?? dictionary.lang;
  exampleReading.textContent = example.reading ?? '';
  exampleReading.hidden = !example.reading;

  exampleFields.replaceChildren(...example.fields.map(field => {
    const row = document.createElement('div');
    const label = document.createElement('dt');
    const value = document.createElement('dd');
    label.textContent = field.label;
    value.textContent = field.text;
    value.lang = field.lang ?? exampleTerm.lang;
    row.append(label, value);
    return row;
  }));

  exampleSource.hidden = !example.source;
  if (example.source) {
    exampleSource.textContent = example.source.label;
    exampleSource.href = example.source.url;
  }
  exampleDialog.showModal();
}

exampleDialog.addEventListener('click', event => {
  if (event.target !== exampleDialog) return;
  const { top, right, bottom, left } = exampleDialog.getBoundingClientRect();
  const { clientX, clientY } = event;
  if (clientX < left || clientX > right || clientY < top || clientY > bottom) {
    exampleDialog.close();
  }
});

function renderCard(dictionary, release) {
  const card = template.content.firstElementChild.cloneNode(true);
  card.id = dictionary.id;

  const mark = card.querySelector('.card-mark');
  mark.textContent = dictionary.mark;
  mark.lang = dictionary.lang;
  card.querySelector('.card-title').textContent = dictionary.title;
  card.querySelector('.card-kind').textContent = dictionary.kind;
  const definition = card.querySelector('.card-definition');
  definition.textContent = definitionLabels[dictionary.definitionType] ?? '';
  definition.dataset.type = dictionary.definitionType ?? '';
  card.querySelector('.card-description').textContent = dictionary.description;

  const subtitle = card.querySelector('.card-subtitle');
  if (dictionary.subtitle) {
    subtitle.textContent = dictionary.subtitle;
    subtitle.lang = dictionary.lang;
  } else {
    subtitle.remove();
  }

  const downloads = card.querySelector('.card-downloads');
  for (const download of dictionary.downloads) {
    const action = link(download.label, download.url, dictionary.title);
    action.className = 'download-link';
    downloads.append(action);
  }

  const meta = card.querySelector('.card-links');
  meta.append(link('Source', dictionary.url, dictionary.title));
  meta.append(link(
    release?.tagName || 'Latest release',
    `${dictionary.url}/releases/latest`,
    dictionary.title
  ));

  if (dictionary.example) {
    const exampleButton = card.querySelector('.example-trigger');
    exampleButton.hidden = false;
    exampleButton.setAttribute('aria-label', `Example · ${dictionary.title}`);
    exampleButton.addEventListener('click', () => showExample(dictionary));
  }
  return card;
}

function normalize(value) {
  return value.normalize('NFKC').toLowerCase();
}

function filterCatalog() {
  const terms = normalize(search.value).trim().split(/\s+/).filter(Boolean);
  let matches = 0;
  for (const section of sections) {
    let sectionMatches = 0;
    for (const { card, keywords } of section.cards) {
      const match = terms.every(term => keywords.includes(term));
      card.hidden = !match;
      sectionMatches += Number(match);
    }
    section.element.hidden = sectionMatches === 0;
    section.navLink.hidden = section.element.hidden;
    matches += sectionMatches;
  }
  status.classList.toggle('visually-hidden', matches > 0);
  status.textContent = matches === 0
    ? 'No dictionaries match your search.'
    : `${matches} ${matches === 1 ? 'dictionary' : 'dictionaries'} shown.`;
}

async function loadCatalog() {
  status.textContent = 'Loading dictionaries…';
  status.classList.remove('visually-hidden');
  try {
    const [dictionaries, releases] = await Promise.all([
      fetchJson('./catalog.json'),
      fetchJson('../releases.json').catch(error => {
        console.error('Could not load release snapshots', error);
        return {};
      })
    ]);

    if (!Array.isArray(dictionaries) || dictionaries.length === 0) {
      throw new Error('The dictionary catalog is empty or invalid');
    }

    for (const dictionary of dictionaries) {
      const section = sections.find(section => section.element.id === dictionary.category);
      const card = renderCard(dictionary, releases?.[dictionary.releaseRepo]);
      const keywords = normalize([
        section.navLink.textContent,
        dictionary.title,
        dictionary.subtitle,
        dictionary.kind,
        definitionLabels[dictionary.definitionType],
        dictionary.description,
        dictionary.releaseRepo,
        ...dictionary.downloads.map(download => download.label)
      ].join(' '));
      section.cards.push({ card, keywords });
      section.grid.append(card);
    }

    toolbar.hidden = false;
    filterCatalog();
    search.addEventListener('input', filterCatalog);

    const target = document.getElementById(location.hash.slice(1));
    if (target?.matches('.collection, .dictionary-card')) {
      target.scrollIntoView();
    }
  } catch (error) {
    console.error('Could not load the dictionary catalog', error);
    status.textContent = 'The catalog is unavailable. Browse the ';
    const github = document.createElement('a');
    github.href = 'https://github.com/caocaochan?tab=repositories';
    github.textContent = 'dictionary repositories on GitHub';
    status.append(github, '.');
  }
}

loadCatalog();
