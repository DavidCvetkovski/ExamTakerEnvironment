'use client';

import React from 'react';
import { useAuthoringStore } from '../../stores/useAuthoringStore';
import './EssayOptionsPanel.css';

export default function EssayOptionsPanel() {
  const { questionType, options, updateOptions } = useAuthoringStore();

  if (questionType !== 'ESSAY') return null;

  // Use type guard or cast since we know it's an object for ESSAY
  const essayOptions = (Array.isArray(options) ? { min_words: 0, max_words: 500 } : options) as { min_words: number; max_words: number };

  const handleChange = (field: 'min_words' | 'max_words', value: string) => {
    const num = value === '' ? '' : parseInt(value, 10);
    updateOptions({ ...essayOptions, [field]: num });
  };

  return (
    <div className="essay-options-container">
      <div className="essay-options-header">
        <h3 className="essay-options-title">📝 Essay Requirements</h3>
        <p className="essay-options-subtitle">Set word count limits for the student&apos;s response.</p>
      </div>

      <div className="essay-inputs-grid">
        <div className="essay-input-group">
          <label className="essay-label">Minimum Words</label>
          <input
            type="number"
            value={essayOptions.min_words ?? ''}
            onChange={(e) => handleChange('min_words', e.target.value)}
            className="essay-number-input [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            min="0"
          />
        </div>

        <div className="essay-input-group">
          <label className="essay-label">Maximum Words</label>
          <input
            type="number"
            value={essayOptions.max_words ?? ''}
            onChange={(e) => handleChange('max_words', e.target.value)}
            className="essay-number-input [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            min="0"
          />
        </div>
      </div>
    </div>
  );
}
