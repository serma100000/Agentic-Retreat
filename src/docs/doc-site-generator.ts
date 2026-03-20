/**
 * Static documentation site generator for OpenPulse.
 *
 * Produces a complete set of HTML/CSS/JS files that form
 * a navigable documentation site with search capabilities.
 */

import type { DocPage, DocSection, DocSite, NavItem, SearchIndexEntry, SiteConfig } from './types.js';

interface GeneratedFile {
  path: string;
  content: string;
}

export class DocSiteGenerator {
  /**
   * Generate the full documentation site structure.
   */
  generateSite(config: SiteConfig, sections: DocSection[]): GeneratedFile[] {
    const files: GeneratedFile[] = [];
    const nav = this.generateNav(sections);
    const allPages: DocPage[] = sections.flatMap(s => s.pages);

    files.push({ path: 'css/style.css', content: this.generateCSS() });
    files.push({ path: 'js/search.js', content: this.generateSearchJS() });
    files.push({ path: 'js/nav.js', content: this.generateNavJS() });
    files.push({
      path: 'search-index.json',
      content: JSON.stringify(this.generateSearch(allPages), null, 2),
    });

    const site: DocSite = {
      title: config.title,
      description: config.description,
      sections,
      nav,
    };

    files.push({
      path: 'index.html',
      content: this.generateIndexPage(site, config),
    });

    for (const section of sections) {
      for (const page of section.pages) {
        files.push({
          path: `${section.name.toLowerCase().replace(/\s+/g, '-')}/${page.slug}.html`,
          content: this.generatePage(page, nav, config),
        });
      }
    }

    return files;
  }

  /**
   * Render a single doc page's markdown content to a full HTML page.
   */
  generatePage(page: DocPage, nav: NavItem[], config: SiteConfig): string {
    const htmlContent = this.markdownToHtml(page.content);
    const navHtml = this.renderNavHtml(nav, page.slug);

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(page.title)} - ${escapeHtml(config.title)}</title>
  <meta name="description" content="${escapeHtml(config.description)}">
  <link rel="stylesheet" href="../css/style.css">
</head>
<body>
  <header class="site-header">
    <div class="header-inner">
      <a href="../index.html" class="logo">${escapeHtml(config.title)}</a>
      <div class="search-container">
        <input type="text" id="search-input" placeholder="Search docs..." autocomplete="off">
        <div id="search-results" class="search-results"></div>
      </div>
      <span class="version">v${escapeHtml(config.version)}</span>
    </div>
  </header>
  <div class="layout">
    <nav class="sidebar" id="sidebar">
      ${navHtml}
    </nav>
    <main class="content">
      <article>
        <h1>${escapeHtml(page.title)}</h1>
        <div class="page-content">${htmlContent}</div>
      </article>
    </main>
  </div>
  <script src="../js/nav.js"></script>
  <script src="../js/search.js"></script>
</body>
</html>`;
  }

  /**
   * Build the navigation structure from sections.
   */
  generateNav(sections: DocSection[]): NavItem[] {
    const items: NavItem[] = [];
    const sorted = [...sections].sort((a, b) => a.order - b.order);

    for (const section of sorted) {
      const sortedPages = [...section.pages].sort((a, b) => a.order - b.order);
      for (const page of sortedPages) {
        items.push({
          title: page.title,
          slug: page.slug,
          section: section.name,
          order: page.order,
        });
      }
    }

    return items;
  }

  /**
   * Build a search index from all pages.
   */
  generateSearch(pages: DocPage[]): SearchIndexEntry[] {
    return pages.map(page => {
      const plainText = page.content
        .replace(/#{1,6}\s+/g, '')
        .replace(/\*{1,3}([^*]+)\*{1,3}/g, '$1')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .replace(/[>\-|]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      const keywords = extractKeywords(plainText);

      return {
        slug: page.slug,
        title: page.title,
        section: page.section,
        content: plainText.slice(0, 500),
        keywords,
      };
    });
  }

  // ── Private Helpers ─────────────────────────────────────────────

  private generateIndexPage(site: DocSite, config: SiteConfig): string {
    const sectionLinks = site.sections
      .sort((a, b) => a.order - b.order)
      .map(section => {
        const sectionSlug = section.name.toLowerCase().replace(/\s+/g, '-');
        const pageLinks = section.pages
          .sort((a, b) => a.order - b.order)
          .map(p => `        <li><a href="${sectionSlug}/${p.slug}.html">${escapeHtml(p.title)}</a></li>`)
          .join('\n');
        return `      <div class="section-card">
        <h2>${escapeHtml(section.name)}</h2>
        <ul>\n${pageLinks}\n        </ul>
      </div>`;
      })
      .join('\n');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(site.title)}</title>
  <meta name="description" content="${escapeHtml(site.description)}">
  <link rel="stylesheet" href="css/style.css">
</head>
<body>
  <header class="site-header">
    <div class="header-inner">
      <a href="index.html" class="logo">${escapeHtml(site.title)}</a>
      <div class="search-container">
        <input type="text" id="search-input" placeholder="Search docs..." autocomplete="off">
        <div id="search-results" class="search-results"></div>
      </div>
      <span class="version">v${escapeHtml(config.version)}</span>
    </div>
  </header>
  <main class="content index-content">
    <section class="hero">
      <h1>${escapeHtml(site.title)}</h1>
      <p class="hero-description">${escapeHtml(site.description)}</p>
    </section>
    <section class="sections-grid">
${sectionLinks}
    </section>
  </main>
  <script src="js/search.js"></script>
</body>
</html>`;
  }

  private renderNavHtml(nav: NavItem[], activeSlug: string): string {
    const grouped = new Map<string, NavItem[]>();
    for (const item of nav) {
      const group = grouped.get(item.section) ?? [];
      group.push(item);
      grouped.set(item.section, group);
    }

    let html = '';
    for (const [section, items] of grouped) {
      const sectionSlug = section.toLowerCase().replace(/\s+/g, '-');
      html += `<div class="nav-section">\n`;
      html += `  <h3 class="nav-section-title">${escapeHtml(section)}</h3>\n`;
      html += `  <ul>\n`;
      for (const item of items) {
        const active = item.slug === activeSlug ? ' class="active"' : '';
        html += `    <li${active}><a href="../${sectionSlug}/${item.slug}.html">${escapeHtml(item.title)}</a></li>\n`;
      }
      html += `  </ul>\n</div>\n`;
    }
    return html;
  }

  /**
   * Minimal Markdown to HTML converter.
   * Handles headings, paragraphs, code blocks, inline code,
   * bold, italic, links, lists, and horizontal rules.
   */
  markdownToHtml(markdown: string): string {
    const lines = markdown.split('\n');
    const result: string[] = [];
    let inCodeBlock = false;
    let codeBlockLang = '';
    let codeLines: string[] = [];
    let inList = false;
    let listType: 'ul' | 'ol' = 'ul';

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;

      if (line.startsWith('```')) {
        if (inCodeBlock) {
          result.push(
            `<pre><code class="language-${escapeHtml(codeBlockLang)}">${escapeHtml(codeLines.join('\n'))}</code></pre>`,
          );
          codeLines = [];
          inCodeBlock = false;
          codeBlockLang = '';
        } else {
          if (inList) {
            result.push(listType === 'ul' ? '</ul>' : '</ol>');
            inList = false;
          }
          inCodeBlock = true;
          codeBlockLang = line.slice(3).trim() || 'text';
        }
        continue;
      }

      if (inCodeBlock) {
        codeLines.push(line);
        continue;
      }

      if (line.trim() === '') {
        if (inList) {
          result.push(listType === 'ul' ? '</ul>' : '</ol>');
          inList = false;
        }
        continue;
      }

      if (/^---+$/.test(line.trim())) {
        result.push('<hr>');
        continue;
      }

      const headingMatch = /^(#{1,6})\s+(.+)$/.exec(line);
      if (headingMatch) {
        if (inList) {
          result.push(listType === 'ul' ? '</ul>' : '</ol>');
          inList = false;
        }
        const level = headingMatch[1]!.length;
        const text = this.inlineMarkdown(headingMatch[2]!);
        const id = headingMatch[2]!.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        result.push(`<h${level} id="${id}">${text}</h${level}>`);
        continue;
      }

      const ulMatch = /^[\-*]\s+(.+)$/.exec(line);
      if (ulMatch) {
        if (!inList || listType !== 'ul') {
          if (inList) result.push(listType === 'ul' ? '</ul>' : '</ol>');
          result.push('<ul>');
          inList = true;
          listType = 'ul';
        }
        result.push(`<li>${this.inlineMarkdown(ulMatch[1]!)}</li>`);
        continue;
      }

      const olMatch = /^\d+\.\s+(.+)$/.exec(line);
      if (olMatch) {
        if (!inList || listType !== 'ol') {
          if (inList) result.push(listType === 'ul' ? '</ul>' : '</ol>');
          result.push('<ol>');
          inList = true;
          listType = 'ol';
        }
        result.push(`<li>${this.inlineMarkdown(olMatch[1]!)}</li>`);
        continue;
      }

      if (inList) {
        result.push(listType === 'ul' ? '</ul>' : '</ol>');
        inList = false;
      }

      result.push(`<p>${this.inlineMarkdown(line)}</p>`);
    }

    if (inCodeBlock) {
      result.push(
        `<pre><code class="language-${escapeHtml(codeBlockLang)}">${escapeHtml(codeLines.join('\n'))}</code></pre>`,
      );
    }
    if (inList) {
      result.push(listType === 'ul' ? '</ul>' : '</ol>');
    }

    return result.join('\n');
  }

  private inlineMarkdown(text: string): string {
    let result = escapeHtml(text);
    result = result.replace(/\*\*\*([^*]+)\*\*\*/g, '<strong><em>$1</em></strong>');
    result = result.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    result = result.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    result = result.replace(/`([^`]+)`/g, '<code>$1</code>');
    result = result.replace(
      /\[([^\]]+)\]\(([^)]+)\)/g,
      '<a href="$2">$1</a>',
    );
    return result;
  }

  private generateCSS(): string {
    return `/* OpenPulse Documentation Styles */
:root {
  --primary: #2563eb;
  --primary-light: #3b82f6;
  --bg: #ffffff;
  --bg-secondary: #f8fafc;
  --text: #1e293b;
  --text-secondary: #64748b;
  --border: #e2e8f0;
  --sidebar-width: 280px;
  --header-height: 60px;
  --code-bg: #f1f5f9;
  --success: #22c55e;
  --warning: #f59e0b;
  --error: #ef4444;
}

* { box-sizing: border-box; margin: 0; padding: 0; }

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  color: var(--text);
  background: var(--bg);
  line-height: 1.6;
}

.site-header {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: var(--header-height);
  background: var(--bg);
  border-bottom: 1px solid var(--border);
  z-index: 100;
  display: flex;
  align-items: center;
}

.header-inner {
  width: 100%;
  max-width: 1400px;
  margin: 0 auto;
  padding: 0 24px;
  display: flex;
  align-items: center;
  gap: 24px;
}

.logo {
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--primary);
  text-decoration: none;
}

.version {
  font-size: 0.8rem;
  color: var(--text-secondary);
  background: var(--bg-secondary);
  padding: 2px 8px;
  border-radius: 4px;
}

.search-container {
  flex: 1;
  max-width: 400px;
  position: relative;
}

#search-input {
  width: 100%;
  padding: 8px 16px;
  border: 1px solid var(--border);
  border-radius: 6px;
  font-size: 0.9rem;
  outline: none;
}

#search-input:focus { border-color: var(--primary); }

.search-results {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 0 0 6px 6px;
  max-height: 300px;
  overflow-y: auto;
  display: none;
  z-index: 200;
}

.search-results.active { display: block; }

.search-result-item {
  padding: 8px 16px;
  cursor: pointer;
  border-bottom: 1px solid var(--border);
}

.search-result-item:hover { background: var(--bg-secondary); }

.search-result-item .title { font-weight: 600; font-size: 0.9rem; }
.search-result-item .section { font-size: 0.75rem; color: var(--text-secondary); }

.layout {
  display: flex;
  margin-top: var(--header-height);
  min-height: calc(100vh - var(--header-height));
}

.sidebar {
  width: var(--sidebar-width);
  flex-shrink: 0;
  border-right: 1px solid var(--border);
  padding: 24px 16px;
  overflow-y: auto;
  position: sticky;
  top: var(--header-height);
  height: calc(100vh - var(--header-height));
}

.nav-section { margin-bottom: 24px; }

.nav-section-title {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-secondary);
  margin-bottom: 8px;
  padding: 0 8px;
}

.nav-section ul { list-style: none; }

.nav-section li a {
  display: block;
  padding: 4px 8px;
  color: var(--text);
  text-decoration: none;
  font-size: 0.9rem;
  border-radius: 4px;
}

.nav-section li a:hover { background: var(--bg-secondary); }
.nav-section li.active a {
  background: rgba(37, 99, 235, 0.1);
  color: var(--primary);
  font-weight: 600;
}

.content {
  flex: 1;
  max-width: 800px;
  padding: 40px;
}

.index-content {
  max-width: 1000px;
  margin: 0 auto;
  padding-top: calc(var(--header-height) + 40px);
}

.hero { text-align: center; margin-bottom: 48px; }
.hero h1 { font-size: 2.5rem; margin-bottom: 16px; }
.hero-description { font-size: 1.1rem; color: var(--text-secondary); }

.sections-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 24px;
}

.section-card {
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 24px;
}

.section-card h2 { font-size: 1.1rem; margin-bottom: 12px; }
.section-card ul { list-style: none; }
.section-card li { margin-bottom: 4px; }
.section-card a { color: var(--primary); text-decoration: none; font-size: 0.9rem; }
.section-card a:hover { text-decoration: underline; }

article h1 { font-size: 2rem; margin-bottom: 24px; border-bottom: 1px solid var(--border); padding-bottom: 16px; }
article h2 { font-size: 1.5rem; margin-top: 32px; margin-bottom: 16px; }
article h3 { font-size: 1.2rem; margin-top: 24px; margin-bottom: 12px; }

article p { margin-bottom: 16px; }

article pre {
  background: var(--code-bg);
  padding: 16px;
  border-radius: 6px;
  overflow-x: auto;
  margin-bottom: 16px;
  font-size: 0.85rem;
  line-height: 1.5;
}

article code {
  font-family: 'SF Mono', 'Fira Code', monospace;
  font-size: 0.85em;
}

article p code, article li code {
  background: var(--code-bg);
  padding: 2px 6px;
  border-radius: 3px;
}

article ul, article ol { margin-bottom: 16px; padding-left: 24px; }
article li { margin-bottom: 4px; }

article a { color: var(--primary); }
article hr { border: none; border-top: 1px solid var(--border); margin: 32px 0; }

@media (max-width: 768px) {
  .sidebar { display: none; }
  .content { padding: 24px 16px; }
  .header-inner { padding: 0 16px; }
}`;
  }

  private generateSearchJS(): string {
    return `(function() {
  var searchIndex = null;
  var input = document.getElementById('search-input');
  var results = document.getElementById('search-results');

  if (!input || !results) return;

  var basePath = window.location.pathname.includes('/') &&
    !window.location.pathname.endsWith('index.html')
    ? '../' : '';

  fetch(basePath + 'search-index.json')
    .then(function(r) { return r.json(); })
    .then(function(data) { searchIndex = data; })
    .catch(function() { searchIndex = []; });

  input.addEventListener('input', function() {
    var query = input.value.toLowerCase().trim();
    if (!query || !searchIndex) {
      results.classList.remove('active');
      return;
    }

    var matches = searchIndex.filter(function(entry) {
      return entry.title.toLowerCase().includes(query) ||
        entry.content.toLowerCase().includes(query) ||
        entry.keywords.some(function(k) { return k.includes(query); });
    }).slice(0, 10);

    if (matches.length === 0) {
      results.classList.remove('active');
      return;
    }

    results.innerHTML = matches.map(function(m) {
      var section = m.section.toLowerCase().replace(/\\s+/g, '-');
      var href = basePath + section + '/' + m.slug + '.html';
      return '<div class="search-result-item" onclick="window.location.href=\\'' + href + '\\''
        + '"><div class="title">' + m.title + '</div>'
        + '<div class="section">' + m.section + '</div></div>';
    }).join('');

    results.classList.add('active');
  });

  document.addEventListener('click', function(e) {
    if (!e.target.closest('.search-container')) {
      results.classList.remove('active');
    }
  });
})();`;
  }

  private generateNavJS(): string {
    return `(function() {
  var sections = document.querySelectorAll('.nav-section-title');
  sections.forEach(function(title) {
    title.style.cursor = 'pointer';
    title.addEventListener('click', function() {
      var list = title.nextElementSibling;
      if (list) {
        list.style.display = list.style.display === 'none' ? 'block' : 'none';
      }
    });
  });
})();`;
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function extractKeywords(text: string): string[] {
  const stopWords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'shall', 'can', 'it', 'its', 'this', 'that',
    'these', 'those', 'not', 'no', 'from', 'as', 'if', 'then', 'than',
  ]);

  const words = text.toLowerCase().split(/\W+/).filter(w => w.length > 2 && !stopWords.has(w));
  const freq = new Map<string, number>();
  for (const w of words) {
    freq.set(w, (freq.get(w) ?? 0) + 1);
  }

  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([word]) => word);
}
