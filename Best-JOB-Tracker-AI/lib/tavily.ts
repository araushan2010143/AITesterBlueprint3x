interface TavilyResult {
  title: string;
  url: string;
  content: string;
  score: number;
}

interface TavilyResponse {
  results: TavilyResult[];
  answer?: string;
}

export async function searchCompanyNews(
  company: string,
  maxResults = 3
): Promise<string[]> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) return [];

  try {
    const response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        query: `${company} company latest news 2024 2025`,
        search_depth: 'basic',
        max_results: maxResults,
        include_answer: false,
      }),
    });

    if (!response.ok) return [];

    const data: TavilyResponse = await response.json();
    return data.results.map((r) => `${r.title}: ${r.content.substring(0, 200)}`);
  } catch {
    return [];
  }
}
