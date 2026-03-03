import React from 'react';

const LineConnector = ({ source, target, themeType, mainColor }) => {
    // To avoid cutting through custom shadow sizes, we start slightly lower than the card center
    // and end right at the top of the next card.
    // Standard card height is roughly 120-150px.

    const startX = source.x;
    const startY = source.y + 110;
    const endX = target.x;
    const endY = target.y - 10;

    let pathString = '';

    if (themeType === 'curve') {
        // Smoother bezier curve
        pathString = `M ${startX} ${startY} C ${startX} ${(startY + endY) / 2}, ${endX} ${(startY + endY) / 2}, ${endX} ${endY}`;
    } else if (themeType === 'straight') {
        // Direct angular line
        pathString = `M ${startX} ${startY} L ${endX} ${endY}`;
    } else {
        // Elbow / Orthogonal (Brutalist default)
        pathString = `M ${startX} ${startY} L ${startX} ${(startY + endY) / 2} L ${endX} ${(startY + endY) / 2} L ${endX} ${endY}`;
    }

    return (
        <path
            d={pathString}
            fill="none"
            stroke={mainColor}
            strokeWidth="2.5"
            style={{ transition: 'all 0.3s ease' }}
        />
    );
};

export default LineConnector;
