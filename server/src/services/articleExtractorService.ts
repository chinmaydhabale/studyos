// StudyOS Article Extraction & Clean Reader Service
// Extracts article title, author, date, lead image, and sanitized reading text

export interface ExtractedArticle {
  success: boolean;
  title: string;
  source: string;
  url: string;
  byline?: string;
  publishedTime?: string;
  leadImageUrl?: string;
  contentHtml: string;
  textContent: string;
  wordCount: number;
  readingTimeMinutes: number;
}

function decodeHtmlEntities(text: string): string {
  if (!text) return '';
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#8217;/g, "'")
    .replace(/&#8216;/g, "'")
    .replace(/&#8220;/g, '"')
    .replace(/&#8221;/g, '"')
    .replace(/&#8211;/g, '-')
    .replace(/&#8212;/g, '--');
}

export function extractArticleFromHtml(html: string, originalUrl: string): ExtractedArticle {
  let hostname = '';
  try {
    hostname = new URL(originalUrl).hostname.replace(/^www\./, '');
  } catch {
    hostname = 'Study Notes';
  }

  // 1. Extract Title
  let title = '';
  const ogTitleMatch = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i) ||
                       html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:title["']/i);
  if (ogTitleMatch && ogTitleMatch[1]) {
    title = decodeHtmlEntities(ogTitleMatch[1].trim());
  } else {
    const titleTagMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    if (titleTagMatch && titleTagMatch[1]) {
      title = decodeHtmlEntities(titleTagMatch[1].replace(/\s+/g, ' ').trim());
    } else {
      const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
      if (h1Match && h1Match[1]) {
        title = decodeHtmlEntities(h1Match[1].replace(/<[^>]+>/g, '').trim());
      }
    }
  }

  if (!title) {
    title = `Notes from ${hostname}`;
  }

  // 2. Extract Source / Site Name
  let source = hostname;
  const siteNameMatch = html.match(/<meta[^>]*property=["']og:site_name["'][^>]*content=["']([^"']+)["']/i) ||
                        html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:site_name["']/i);
  if (siteNameMatch && siteNameMatch[1]) {
    source = decodeHtmlEntities(siteNameMatch[1].trim());
  }

  // 3. Extract Byline / Author
  let byline = '';
  const authorMatch = html.match(/<meta[^>]*name=["']author["'][^>]*content=["']([^"']+)["']/i) ||
                      html.match(/<meta[^>]*property=["']article:author["'][^>]*content=["']([^"']+)["']/i) ||
                      html.match(/class=["'][^"']*\b(author|byline)\b[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/i);
  if (authorMatch) {
    const rawAuthor = authorMatch[1] || authorMatch[2] || '';
    byline = decodeHtmlEntities(rawAuthor.replace(/<[^>]+>/g, '').trim());
  }

  // 4. Extract Published Date
  let publishedTime = '';
  const dateMatch = html.match(/<meta[^>]*property=["']article:published_time["'][^>]*content=["']([^"']+)["']/i) ||
                    html.match(/<meta[^>]*name=["']pubdate["'][^>]*content=["']([^"']+)["']/i) ||
                    html.match(/<time[^>]*datetime=["']([^"']+)["']/i);
  if (dateMatch && dateMatch[1]) {
    try {
      const parsedDate = new Date(dateMatch[1]);
      if (!isNaN(parsedDate.getTime())) {
        publishedTime = parsedDate.toLocaleDateString('en-IN', {
          year: 'numeric',
          month: 'short',
          day: 'numeric'
        });
      }
    } catch {
      publishedTime = dateMatch[1].split('T')[0];
    }
  }

  // 5. Extract Lead Image
  let leadImageUrl = '';
  const ogImgMatch = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i) ||
                     html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i);
  if (ogImgMatch && ogImgMatch[1]) {
    leadImageUrl = ogImgMatch[1].trim();
    if (leadImageUrl.startsWith('/')) {
      try {
        leadImageUrl = new URL(leadImageUrl, originalUrl).href;
      } catch {}
    }
  }

  // 6. Clean Body and Extract Content
  // Remove non-content elements
  let cleanHtml = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<header[\s\S]*?<\/header>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<aside[\s\S]*?<\/aside>/gi, '')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
    .replace(/<form[\s\S]*?<\/form>/gi, '')
    .replace(/<svg[\s\S]*?<\/svg>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');

  // Look for semantic article container
  let articleBlock = '';
  const articleTagMatch = cleanHtml.match(/<article[\s\S]*?>([\s\S]*?)<\/article>/i);
  const mainTagMatch = cleanHtml.match(/<main[\s\S]*?>([\s\S]*?)<\/main>/i);
  const classMatches = cleanHtml.match(/<div[^>]*class=["'][^"']*\b(entry-content|article-body|story-content|content-body|post-content|main-content|story_content|news-detail)\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);

  if (articleTagMatch && articleTagMatch[1].length > 400) {
    articleBlock = articleTagMatch[1];
  } else if (classMatches && classMatches[2].length > 400) {
    articleBlock = classMatches[2];
  } else if (mainTagMatch && mainTagMatch[1].length > 400) {
    articleBlock = mainTagMatch[1];
  } else {
    // Fallback: extract paragraphs from full page
    articleBlock = cleanHtml;
  }

  // Extract meaningful blocks: p, h2, h3, h4, blockquote, ul, ol, table
  const contentItems: string[] = [];
  const tagRegex = /<(p|h2|h3|h4|blockquote|ul|ol|table)[^>]*>([\s\S]*?)<\/\1>/gi;
  let match;
  while ((match = tagRegex.exec(articleBlock)) !== null) {
    const tagName = match[1].toLowerCase();
    let innerContent = match[2];

    // Strip any nested interactive tags
    innerContent = innerContent.replace(/<script[\s\S]*?<\/script>/gi, '');
    const textOnly = innerContent.replace(/<[^>]+>/g, '').trim();

    // Skip empty or trivial blocks
    if (textOnly.length < 8 && tagName === 'p') continue;
    // Skip ad/boilerplate markers
    if (/also read:|subscribe to|advertisement|share this story|sign up for|cookie policy/i.test(textOnly)) {
      continue;
    }

    // Sanitize inner HTML: allow strong, em, b, i, a, span
    let sanitizedInner = innerContent
      .replace(/<(?!\/?(strong|em|b|i|a|span|li|tr|td|th)\b)[^>]+>/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    // Rebase links
    sanitizedInner = sanitizedInner.replace(/href=["'](\/[^"']*)["']/gi, (_m, path) => {
      try {
        return `href="${new URL(path, originalUrl).href}"`;
      } catch {
        return `href="${path}"`;
      }
    });

    if (tagName.startsWith('h')) {
      contentItems.push(`<${tagName} class="font-bold text-slate-100 mt-6 mb-3 text-lg">${textOnly}</${tagName}>`);
    } else if (tagName === 'blockquote') {
      contentItems.push(`<blockquote class="border-l-4 border-cyan-500 pl-4 py-1 my-4 italic text-slate-300 bg-cyan-950/20 rounded-r-lg">${sanitizedInner}</blockquote>`);
    } else if (tagName === 'ul' || tagName === 'ol') {
      contentItems.push(`<${tagName} class="list-disc list-inside space-y-1 my-3 text-slate-300 pl-2 leading-relaxed">${sanitizedInner}</${tagName}>`);
    } else if (tagName === 'table') {
      contentItems.push(`<div class="overflow-x-auto my-4 border border-white/10 rounded-xl p-2 bg-slate-900/60">${innerContent}</div>`);
    } else {
      contentItems.push(`<p class="text-slate-300 leading-relaxed mb-4 text-sm sm:text-base">${sanitizedInner}</p>`);
    }
  }

  const contentHtml = contentItems.join('\n');
  const textContent = contentItems
    .map(c => c.replace(/<[^>]+>/g, '').trim())
    .filter(t => t.length > 0)
    .join('\n\n');

  const words = textContent.trim().split(/\s+/).filter(Boolean);
  const wordCount = words.length;
  const readingTimeMinutes = Math.max(1, Math.ceil(wordCount / 200));

  return {
    success: wordCount > 20,
    title,
    source,
    url: originalUrl,
    byline: byline || undefined,
    publishedTime: publishedTime || undefined,
    leadImageUrl: leadImageUrl || undefined,
    contentHtml: contentHtml || `<p class="text-slate-400 italic">No structured article text could be parsed from this page. You can switch to Web View or open in a Companion Window.</p>`,
    textContent,
    wordCount,
    readingTimeMinutes
  };
}
