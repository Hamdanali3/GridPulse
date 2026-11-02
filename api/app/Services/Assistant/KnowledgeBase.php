<?php

namespace App\Services\Assistant;

final class KnowledgeBase
{
    /** @var list<array{id: string, title: string, keywords: list<string>, content: string}>|null */
    private ?array $topics = null;

    /**
     * @return list<array{id: string, title: string, keywords: list<string>, content: string}>
     */
    public function allTopics(): array
    {
        if ($this->topics !== null) {
            return $this->topics;
        }

        $path = resource_path('knowledge/gridpulse_kb.json');
        if (! is_file($path)) {
            return $this->topics = [];
        }

        $decoded = json_decode((string) file_get_contents($path), true);
        $this->topics = is_array($decoded['topics'] ?? null) ? array_values($decoded['topics']) : [];

        return $this->topics;
    }

    /**
     * Simple BM25-inspired keyword + term scorer over the curated knowledge base.
     *
     * @return list<array{id: string, title: string, content: string}>
     */
    public function search(string $query, int $limit = 4): array
    {
        $topics = $this->allTopics();
        $normalized = strtolower(trim($query));
        if ($normalized === '') {
            return array_map(
                fn (array $t) => ['id' => $t['id'], 'title' => $t['title'], 'content' => $t['content']],
                array_slice($topics, 0, $limit)
            );
        }

        $tokens = array_values(array_filter(
            preg_split('/[^a-z0-9_]+/', $normalized) ?: [],
            fn (string $w) => strlen($w) >= 2
        ));

        $scored = [];
        foreach ($topics as $idx => $topic) {
            $score = 0;
            $titleLower = strtolower($topic['title']);
            $bodyLower = strtolower($topic['content']);

            foreach ($topic['keywords'] as $kw) {
                $kwLower = strtolower($kw);
                if (str_contains($normalized, $kwLower)) {
                    $score += 6;
                }
            }

            foreach ($tokens as $tok) {
                if (str_contains($titleLower, $tok)) {
                    $score += 4;
                }
                foreach ($topic['keywords'] as $kw) {
                    if (str_contains(strtolower($kw), $tok)) {
                        $score += 3;
                        break;
                    }
                }
                if (str_contains($bodyLower, $tok)) {
                    $score += 1;
                }
            }

            $scored[] = ['score' => $score, 'idx' => $idx, 'topic' => $topic];
        }

        usort($scored, fn ($a, $b) => $b['score'] <=> $a['score'] ?: $a['idx'] <=> $b['idx']);
        $positive = array_filter($scored, fn ($x) => $x['score'] > 0);
        $picked = count($positive) > 0 ? array_slice(array_values($positive), 0, $limit) : array_slice($scored, 0, min(2, $limit));

        return array_map(
            fn ($item) => [
                'id' => $item['topic']['id'],
                'title' => $item['topic']['title'],
                'content' => $item['topic']['content'],
            ],
            $picked
        );
    }

    public function fullContext(): string
    {
        $blocks = [];
        foreach ($this->allTopics() as $t) {
            $blocks[] = "### {$t['title']}\n{$t['content']}";
        }

        return implode("\n\n", $blocks);
    }

    /** @return list<string> */
    public static function publicSuggestions(): array
    {
        return [
            'What is GridPulse and what problem does it solve in Chitral?',
            'How do alerts automatically become work orders?',
            'What can Admin, Engineer, and Viewer roles do?',
            'How is live solar, hydro, and wind telemetry simulated?',
            'How can I try the live demo accounts?',
            'Who built GridPulse and what tech stack powers it?',
        ];
    }
}

