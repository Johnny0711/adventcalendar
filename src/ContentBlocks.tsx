import { useState } from 'react';
import type { DayContent } from '../server/content';

function Quiz({
  block,
}: {
  block: Extract<DayContent['blocks'][number], { type: 'quiz' }>;
}) {
  const [choice, setChoice] = useState<number>();
  return (
    <section className="quiz">
      <span className="quiz-eyebrow">a little question for you</span>
      <h2>{block.question}</h2>
      <div className="choices">
        {block.options.map((option, index) => (
          <button
            key={index}
            type="button"
            aria-pressed={choice === index}
            onClick={() => setChoice(index)}
          >
            {option}
          </button>
        ))}
      </div>
      {choice !== undefined && (
        <p className="quiz-feedback" role="status">
          {choice === block.answer
            ? `That’s the one! ♡ ${block.explanation}`
            : 'Another little guess?'}
        </p>
      )}
    </section>
  );
}
export function ContentBlocks({ content }: { content: DayContent }) {
  return (
    <div className="blocks">
      {content.blocks.map((block, index) => {
        const url =
          'src' in block
            ? `/api/media/${content.day}/${encodeURIComponent(block.src)}`
            : '';
        switch (block.type) {
          case 'text':
            return (
              <p className="message" key={index}>
                {block.content}
              </p>
            );
          case 'letter':
            return (
              <div className="letter" key={index}>
                <span className="letter-seal" aria-hidden="true">
                  {'\u2661'}
                </span>
                <div className="letter-copy">{block.content}</div>
              </div>
            );
          case 'image':
            return (
              <figure key={index}>
                <img src={url} alt={block.alt} loading="lazy" />
                <figcaption>{block.alt}</figcaption>
              </figure>
            );
          case 'video':
            return (
              <figure key={index}>
                <video
                  src={url}
                  controls
                  playsInline
                  preload="metadata"
                  aria-label={block.caption ?? 'Video message'}
                />
                {block.caption && <figcaption>{block.caption}</figcaption>}
              </figure>
            );
          case 'audio':
            return (
              <figure key={index}>
                <audio
                  src={url}
                  controls
                  preload="metadata"
                  aria-label={block.caption ?? 'Audio message'}
                />
                {block.caption && <figcaption>{block.caption}</figcaption>}
              </figure>
            );
          case 'file':
            return (
              <a className="button" key={index} href={url}>
                {block.label} ↓
              </a>
            );
          case 'quiz':
            return <Quiz key={index} block={block} />;
        }
      })}
    </div>
  );
}
