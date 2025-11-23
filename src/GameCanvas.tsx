import React from 'react';

interface GameCanvasProps {
    text: string;
}

const GameCanvas: React.FC<GameCanvasProps> = ({ text }) => {
    return <div>{text}</div>;
};

export default GameCanvas;