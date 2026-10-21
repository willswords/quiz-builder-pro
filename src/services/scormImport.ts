import JSZip from 'jszip';
import { Quiz, Question, QuestionType, Option } from '../types';
import { v4 as uuidv4 } from 'uuid';

const deobfuscate = (str: string): string | null => {
  try {
    return decodeURIComponent(
      atob(str)
        .split('')
        .map((c, i) => String.fromCharCode(c.charCodeAt(0) ^ (i % 255)))
        .join('')
    );
  } catch (e) {
    console.error('Decryption/Deobfuscation failed', e);
    return null;
  }
};

/**
 * Import and parse a SCORM 2004 zip file back into a Quiz structure.
 */
export const importScorm2004 = async (file: File | Blob): Promise<Partial<Quiz>> => {
  const zip = new JSZip();
  const loadedZip = await zip.loadAsync(file);

  // 1. Try to find index.html or any html/js file containing QuizBuilder rawData
  let indexHtmlContent: string | null = null;
  let manifestContent: string | null = null;

  for (const relativePath of Object.keys(loadedZip.files)) {
    const lowerPath = relativePath.toLowerCase();
    if (lowerPath.endsWith('index.html') || lowerPath.endsWith('index.htm') || lowerPath.endsWith('player.html')) {
      indexHtmlContent = await loadedZip.files[relativePath].async('text');
    }
    if (lowerPath.endsWith('imsmanifest.xml')) {
      manifestContent = await loadedZip.files[relativePath].async('text');
    }
  }

  // If index.html was not found by exact name, look for any html file
  if (!indexHtmlContent) {
    for (const relativePath of Object.keys(loadedZip.files)) {
      if (relativePath.toLowerCase().endsWith('.html') || relativePath.toLowerCase().endsWith('.htm')) {
        indexHtmlContent = await loadedZip.files[relativePath].async('text');
        break;
      }
    }
  }

  // 2. Attempt QuizBuilder Pro embedded rawData parsing
  if (indexHtmlContent) {
    // Check for const rawData pattern
    const isEncryptedMatch = indexHtmlContent.match(/const\s+isEncrypted\s*=\s*(true|false);/);
    const isEncrypted = isEncryptedMatch ? isEncryptedMatch[1] === 'true' : false;

    // Pattern for rawData: const rawData = ...;
    // Look for const rawData = ... up to the next semicolon or declaration
    const rawDataMatch = indexHtmlContent.match(/const\s+rawData\s*=\s*([\s\S]*?);\r?\n\s*(?:const|var|let|function|\/\*|\/\/)/);
    
    if (rawDataMatch && rawDataMatch[1]) {
      let rawDataStr = rawDataMatch[1].trim();
      
      try {
        let quizData: any = null;

        if (isEncrypted) {
          // Trim wrapping quotes if present
          if (rawDataStr.startsWith('"') && rawDataStr.endsWith('"')) {
            rawDataStr = rawDataStr.slice(1, -1);
          } else if (rawDataStr.startsWith("'") && rawDataStr.endsWith("'")) {
            rawDataStr = rawDataStr.slice(1, -1);
          }
          
          // Unescape JS string escapes if needed
          rawDataStr = JSON.parse(`"${rawDataStr.replace(/"/g, '\\"')}"`);
          
          const deobfuscated = deobfuscate(rawDataStr);
          if (deobfuscated) {
            quizData = JSON.parse(deobfuscated);
          }
        } else {
          quizData = JSON.parse(rawDataStr);
        }

        if (quizData && (quizData.questions || quizData.title)) {
          return quizData;
        }
      } catch (err) {
        console.warn('Attempted to parse embedded QuizBuilder rawData, falling back to alternative parsing:', err);
      }
    }

    // Secondary attempt: look for JSON object in any script tag or string in indexHtmlContent
    try {
      const genericJsonMatch = indexHtmlContent.match(/{"id":[\s\S]*?"questions":\s*\[[\s\S]*?\]}/);
      if (genericJsonMatch) {
        const parsed = JSON.parse(genericJsonMatch[0]);
        if (parsed && Array.isArray(parsed.questions)) {
          return parsed;
        }
      }
    } catch (e) {
      // Ignore
    }
  }

  // 3. Fallback: Parse generic SCORM 2004 zip file (HTML DOM / imsmanifest.xml)
  let quizTitle = 'Imported SCORM Quiz';
  
  if (manifestContent) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(manifestContent, 'text/xml');
    const titleEl = doc.querySelector('organization > title') || doc.querySelector('title');
    if (titleEl && titleEl.textContent?.trim()) {
      quizTitle = titleEl.textContent.trim();
    }
  }

  if (indexHtmlContent) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(indexHtmlContent, 'text/html');
    
    // Extract title from HTML head/title if manifest title was generic
    const pageTitle = doc.querySelector('title')?.textContent?.trim();
    if (pageTitle && pageTitle !== 'SCORM Player' && quizTitle === 'Imported SCORM Quiz') {
      quizTitle = pageTitle;
    }

    const questions: Question[] = [];

    // Look for options & questions in HTML elements
    const questionCards = doc.querySelectorAll('.card, .question-card, .question-item, .question, [data-question]');
    
    questionCards.forEach((card, qIdx) => {
      const titleEl = card.querySelector('.question-text, .question-title, h1, h2, h3, h4, .text');
      if (!titleEl) return;

      const qText = titleEl.textContent?.trim() || `Question ${qIdx + 1}`;
      const options: Option[] = [];

      const optionEls = card.querySelectorAll('.option, .choice, li, label');
      optionEls.forEach((optEl) => {
        const optText = optEl.textContent?.replace(/✓|Correct Answer/gi, '').trim();
        if (optText && optText.length < 300) {
          const isCorrect = optEl.classList.contains('correct') || optEl.querySelector('.correct-label') !== null;
          options.push({
            id: uuidv4(),
            text: optText,
            isCorrect
          });
        }
      });

      if (options.length > 0) {
        questions.push({
          id: uuidv4(),
          type: options.filter(o => o.isCorrect).length > 1 ? 'multiple-choice' : 'single-choice',
          text: qText,
          options
        });
      }
    });

    if (questions.length > 0) {
      return {
        title: quizTitle,
        questions
      };
    }
  }

  throw new Error('Could not find readable quiz questions or embedded data inside the SCORM 2004 zip file. Please ensure it is a valid SCORM 2004 package.');
};
