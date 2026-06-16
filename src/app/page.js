'use client';

import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import Confetti from '../components/Confetti';
import {
  playClick,
  playTick,
  playGo,
  playSuccess,
  playError,
  playWin
} from '../utils/sounds';

export default function Home() {
  // Socket reference
  const socketRef = useRef(null);

  // Connection & Room state
  const [connected, setConnected] = useState(false);
  const [playerName, setPlayerName] = useState('');
  const [inputRoomCode, setInputRoomCode] = useState('');
  const [activeRoom, setActiveRoom] = useState('');
  const [players, setPlayers] = useState([]);
  const [myInfo, setMyInfo] = useState(null);
  const [opponentInfo, setOpponentInfo] = useState(null);

  // Game state flow
  // lobby, waiting, inputting, countdown, playing, round-end, game-end
  const [gameState, setGameState] = useState('lobby');
  const [roundNumber, setRoundNumber] = useState(1);
  const [secretNumber, setSecretNumber] = useState('');
  const [secretSubmitted, setSecretSubmitted] = useState(false);
  const [opponentReady, setOpponentReady] = useState(false);
  const [countdown, setCountdown] = useState(3);
  const [revealedNumbers, setRevealedNumbers] = useState([]);
  const [sumGuess, setSumGuess] = useState('');
  const [wrongGuess, setWrongGuess] = useState(false);
  const [roundResults, setRoundResults] = useState(null);
  const [readyForNext, setReadyForNext] = useState(false);
  const [readyForRematch, setReadyForRematch] = useState(false);

  // UI Messages
  const [errorMsg, setErrorMsg] = useState('');
  const [copyFeedback, setCopyFeedback] = useState(false);

  // Refs for input focus
  const numberInputRef = useRef(null);
  const guessInputRef = useRef(null);

  // Initialize socket connection
  useEffect(() => {
    // Connect to same host
    const socket = io();
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      console.log('Connected to server');
    });

    socket.on('disconnect', () => {
      setConnected(false);
      // Reset back to lobby on disconnect
      setGameState('lobby');
      setActiveRoom('');
      setMyInfo(null);
      setOpponentInfo(null);
    });

    socket.on('room-created', ({ roomCode, player }) => {
      setActiveRoom(roomCode);
      setMyInfo(player);
      setGameState('waiting');
    });

    socket.on('game-started', ({ roomCode, players: roomPlayers, state, roundNumber: roundNum }) => {
      setActiveRoom(roomCode);
      setPlayers(roomPlayers);
      setRoundNumber(roundNum);
      
      // Identify self and opponent
      const self = roomPlayers.find(p => p.id === socket.id);
      const opp = roomPlayers.find(p => p.id !== socket.id);
      
      setMyInfo(self);
      setOpponentInfo(opp);
      
      // Reset round-specific flags
      setSecretSubmitted(false);
      setOpponentReady(false);
      setSecretNumber('');
      setSumGuess('');
      setWrongGuess(false);
      setReadyForNext(false);
      setReadyForRematch(false);
      
      setGameState('inputting');
    });

    socket.on('opponent-ready', () => {
      setOpponentReady(true);
    });

    socket.on('state-update', ({ state }) => {
      setGameState(state);
    });

    socket.on('countdown-tick', (count) => {
      setGameState('countdown');
      setCountdown(count);
      if (count > 0) {
        playTick();
      }
    });

    socket.on('round-started', ({ numbers }) => {
      setRevealedNumbers(numbers);
      setGameState('playing');
      setSumGuess('');
      setWrongGuess(false);
      playGo();
    });

    socket.on('round-completed', ({ winnerId, winnerName, solveTime, scores, numbers, sum, gameWinnerId }) => {
      // Find updated scores
      const updatedSelf = scores.find(p => p.id === socket.id);
      const updatedOpp = scores.find(p => p.id !== socket.id);
      
      setMyInfo(updatedSelf);
      setOpponentInfo(updatedOpp);

      setRoundResults({
        winnerId,
        winnerName,
        solveTime,
        numbers,
        sum,
        isSelfWinner: winnerId === socket.id
      });

      if (winnerId === socket.id) {
        playSuccess();
      } else {
        playError();
      }

      if (gameWinnerId) {
        setGameState('game-end');
        if (gameWinnerId === socket.id) {
          playWin();
        }
      } else {
        setGameState('round-end');
      }
    });

    socket.on('guess-wrong', () => {
      setWrongGuess(true);
      playError();
      setTimeout(() => {
        setWrongGuess(false);
      }, 500);
    });

    socket.on('opponent-disconnected', ({ msg }) => {
      setErrorMsg(msg);
      playError();
      // Reset to lobby or waiting if they left
      setTimeout(() => {
        setErrorMsg('');
        setGameState('lobby');
        setActiveRoom('');
        setMyInfo(null);
        setOpponentInfo(null);
      }, 4000);
    });

    socket.on('error-msg', (msg) => {
      setErrorMsg(msg);
      playError();
      setTimeout(() => {
        setErrorMsg('');
      }, 3000);
    });

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, []);

  // Autofocus inputs based on game phase
  useEffect(() => {
    if (gameState === 'inputting' && numberInputRef.current) {
      numberInputRef.current.focus();
    } else if (gameState === 'playing' && guessInputRef.current) {
      guessInputRef.current.focus();
    }
  }, [gameState]);

  // Actions
  const handleCreateRoom = (e) => {
    e.preventDefault();
    if (!playerName.trim()) {
      setErrorMsg('Please enter a display name first.');
      return;
    }
    playClick();
    socketRef.current.emit('create-room', { playerName: playerName.trim() });
  };

  const handleJoinRoom = (e) => {
    e.preventDefault();
    if (!playerName.trim()) {
      setErrorMsg('Please enter a display name first.');
      return;
    }
    if (!inputRoomCode.trim()) {
      setErrorMsg('Please enter a room code.');
      return;
    }
    playClick();
    socketRef.current.emit('join-room', {
      roomCode: inputRoomCode.trim(),
      playerName: playerName.trim()
    });
  };

  const handleSubmitNumber = (e) => {
    e.preventDefault();
    const num = parseInt(secretNumber, 10);
    if (isNaN(num) || num < 0 || num > 100) {
      setErrorMsg('Choose a number between 0 and 100.');
      return;
    }
    playClick();
    setSecretSubmitted(true);
    socketRef.current.emit('submit-number', { roomCode: activeRoom, number: num });
  };

  const handleGuessSubmit = (e) => {
    e.preventDefault();
    if (!sumGuess.trim()) return;
    socketRef.current.emit('submit-guess', { roomCode: activeRoom, guess: sumGuess.trim() });
  };

  const handleNextRound = () => {
    playClick();
    setReadyForNext(true);
    socketRef.current.emit('request-next-round', { roomCode: activeRoom });
  };

  const handleRematch = () => {
    playClick();
    setReadyForRematch(true);
    socketRef.current.emit('request-rematch', { roomCode: activeRoom });
  };

  const copyRoomCode = () => {
    navigator.clipboard.writeText(activeRoom);
    setCopyFeedback(true);
    playClick();
    setTimeout(() => {
      setCopyFeedback(false);
    }, 2000);
  };

  return (
    <div className="app-container">
      {/* Confetti celebration for Match Winner */}
      {gameState === 'game-end' && myInfo?.score >= 3 && <Confetti />}

      {/* Header */}
      <header className="app-header">
        <div className="logo-text">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="m12 3-1.912 5.886L4.202 9l5.043 3.966L7.332 19 12 15.114 16.668 19l-1.913-6.034 5.043-3.966-5.886-.114Z"/>
          </svg>
          SPEED SUM
        </div>
        <div className="status-indicator">
          <span className={`status-dot ${connected ? 'connected' : ''}`}></span>
          {connected ? 'ONLINE' : 'CONNECTING...'}
        </div>
      </header>

      {/* Error Toast */}
      {errorMsg && (
        <div className="alert-box alert-info" style={{ borderLeftColor: 'var(--color-neon-pink)' }}>
          <div className="alert-pulsing-dot" style={{ backgroundColor: 'var(--color-neon-pink)' }}></div>
          <div className="message" style={{ color: 'white' }}>{errorMsg}</div>
        </div>
      )}

      {/* 1. Lobby State */}
      {gameState === 'lobby' && (
        <div className="glass-card glow-cyan text-center">
          <h1 className="lobby-title">Speed Sum Duel</h1>
          <p className="lobby-subtitle">Enter a secret number, wait for the countdown, and calculate the sum faster than your opponent to win!</p>

          <form onSubmit={handleCreateRoom} className="form-group">
            <label className="form-label">Your Username</label>
            <input
              type="text"
              className="input-glow"
              placeholder="e.g. Speedrunner"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              maxLength={12}
              required
            />
            <button type="submit" className="btn btn-primary btn-full" style={{ marginTop: '1.5rem' }}>
              Create Room
            </button>
          </form>

          <div className="divider">OR</div>

          <form onSubmit={handleJoinRoom}>
            <div className="form-group">
              <label className="form-label">Join Existing Room</label>
              <input
                type="text"
                className="input-glow"
                placeholder="Enter 4-Letter Code"
                value={inputRoomCode}
                onChange={(e) => setInputRoomCode(e.target.value.toUpperCase())}
                maxLength={4}
                style={{ textAlign: 'center', letterSpacing: '0.15em', fontFamily: 'var(--font-monospace)' }}
              />
            </div>
            <button type="submit" className="btn btn-secondary btn-full">
              Join Room
            </button>
          </form>

          <div className="rules-container">
            <h4 className="rules-title">How to Play</h4>
            <ul className="rules-list">
              <li>Enter a secret number from 0 to 100 each round.</li>
              <li>A 3-second countdown will start once both players are ready.</li>
              <li>Add your number and your opponent&apos;s number as fast as possible.</li>
              <li>Type the correct sum and press Enter. Fastest brain wins the round!</li>
              <li>First player to win 3 rounds wins the match.</li>
            </ul>
          </div>
        </div>
      )}

      {/* 2. Waiting Room State */}
      {gameState === 'waiting' && (
        <div className="glass-card text-center">
          <h2>Room Code Created</h2>
          <p className="lobby-subtitle">Share this code with your opponent to connect</p>

          <div className="room-code-display">
            {activeRoom}
            <button onClick={copyRoomCode} className="copy-btn" title="Copy code to clipboard">
              {copyFeedback ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--color-neon-green)" strokeWidth="2.5">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                </svg>
              )}
            </button>
          </div>

          <div className="alert-box alert-info">
            <div className="alert-pulsing-dot"></div>
            <div className="message">Waiting for Player 2 to join...</div>
          </div>
        </div>
      )}

      {/* Score Header for Active Game Screens */}
      {['inputting', 'countdown', 'playing', 'round-end'].includes(gameState) && (
        <div className="game-header">
          <div className="scoreboard-compact">
            <div className="score-player">
              <span className="name">{myInfo?.name} (You)</span>
              <span className="score">{myInfo?.score}</span>
            </div>
            <div className="reveal-operator" style={{ fontSize: '1.5rem' }}>vs</div>
            <div className="score-player opponent">
              <span className="name">{opponentInfo?.name}</span>
              <span className="score">{opponentInfo?.score}</span>
            </div>
          </div>
          <span className="round-badge">Round {roundNumber}</span>
        </div>
      )}

      {/* 3. Number Input State */}
      {gameState === 'inputting' && (
        <div className="glass-card text-center glow-cyan">
          <h2>Select Secret Number</h2>
          <p className="lobby-subtitle" style={{ marginTop: '0.5rem' }}>
            Choose a value between 0 and 100.
          </p>

          {!secretSubmitted ? (
            <form onSubmit={handleSubmitNumber}>
              <input
                ref={numberInputRef}
                type="number"
                min="0"
                max="100"
                className="number-input-huge"
                value={secretNumber}
                onChange={(e) => setSecretNumber(e.target.value)}
                placeholder="0"
                required
              />
              <button type="submit" className="btn btn-primary btn-full" style={{ marginTop: '1.5rem' }}>
                Lock Number
              </button>
            </form>
          ) : (
            <div style={{ marginTop: '2rem' }}>
              <div className="alert-box alert-info">
                <div className="alert-pulsing-dot"></div>
                <div className="message">
                  {opponentReady
                    ? 'Preparing countdown...'
                    : 'Submitted! Waiting for opponent to lock their number...'}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 4. Countdown State */}
      {gameState === 'countdown' && (
        <div className="glass-card text-center">
          <div className="countdown-overlay">
            <div className="countdown-number">{countdown}</div>
            <div className="countdown-label">GET READY...</div>
          </div>
        </div>
      )}

      {/* 5. Playing/Solving State */}
      {gameState === 'playing' && (
        <div className="glass-card text-center">
          <h2>CALCULATE THE SUM!</h2>
          <p className="lobby-subtitle">Type the answer and hit Enter as fast as you can</p>

          <div className="numbers-reveal-container">
            <div className="number-card cyan">
              <div className="card-val">
                {revealedNumbers.find(n => n.playerId === myInfo?.id)?.value}
              </div>
              <div className="card-owner">You</div>
            </div>

            <div className="reveal-operator">+</div>

            <div className="number-card violet">
              <div className="card-val">
                {revealedNumbers.find(n => n.playerId === opponentInfo?.id)?.value}
              </div>
              <div className="card-owner">{opponentInfo?.name}</div>
            </div>
          </div>

          <div className="speed-input-container">
            <form onSubmit={handleGuessSubmit}>
              <input
                ref={guessInputRef}
                type="number"
                pattern="[0-9]*"
                inputMode="numeric"
                className={`input-glow input-huge-sum ${wrongGuess ? 'wrong-shake' : ''}`}
                placeholder="?"
                value={sumGuess}
                onChange={(e) => setSumGuess(e.target.value)}
                disabled={wrongGuess}
                required
              />
            </form>
          </div>
        </div>
      )}

      {/* 6. Round End Results State */}
      {gameState === 'round-end' && roundResults && (
        <div className="glass-card text-center">
          {roundResults.isSelfWinner && <Confetti />}

          <div className="winner-announcement">
            <div className={`winner-avatar ${roundResults.isSelfWinner ? 'green' : ''}`}>
              {roundResults.isSelfWinner ? '🏆' : '💀'}
            </div>
            <div className="winner-name">
              {roundResults.isSelfWinner ? 'You won the round!' : `${roundResults.winnerName} won the round!`}
            </div>
            <div className="win-speed">Solve time: {roundResults.solveTime}s</div>
          </div>

          <div className="results-formula">
            {roundResults.numbers[0].value} + {roundResults.numbers[1].value} = <span>{roundResults.sum}</span>
          </div>

          <button
            onClick={handleNextRound}
            disabled={readyForNext}
            className="btn btn-primary btn-full"
          >
            {readyForNext ? 'Waiting for opponent...' : 'Ready for Next Round'}
          </button>
        </div>
      )}

      {/* 7. Match Game Over State */}
      {gameState === 'game-end' && (
        <div className="glass-card text-center">
          <h2 className="match-winner-title">Match Completed</h2>
          <p className="lobby-subtitle">
            {myInfo?.score >= 3 ? '🎉 Congratulations, you won!' : `💀 ${opponentInfo?.name} won the match!`}
          </p>

          <div className="podium-container">
            {/* Runner up */}
            <div className="podium-column runner-up">
              <div className="podium-avatar">🥈</div>
              <div className="podium-name">
                {myInfo?.score < 3 ? myInfo?.name : opponentInfo?.name}
              </div>
              <div className="podium-score">
                {myInfo?.score < 3 ? myInfo?.score : opponentInfo?.score}
              </div>
            </div>

            {/* Winner */}
            <div className="podium-column winner">
              <div className="podium-avatar">👑</div>
              <div className="podium-name" style={{ fontWeight: 'bold', color: 'white' }}>
                {myInfo?.score >= 3 ? myInfo?.name : opponentInfo?.name}
              </div>
              <div className="podium-score" style={{ color: 'var(--color-cyan)', fontSize: '1.4rem' }}>
                {myInfo?.score >= 3 ? myInfo?.score : opponentInfo?.score}
              </div>
            </div>
          </div>

          <button
            onClick={handleRematch}
            disabled={readyForRematch}
            className="btn btn-primary btn-full"
            style={{ marginTop: '1rem' }}
          >
            {readyForRematch ? 'Waiting for opponent...' : 'Rematch Duel'}
          </button>
        </div>
      )}
    </div>
  );
}
