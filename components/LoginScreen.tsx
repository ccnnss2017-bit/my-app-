import React, { useState } from 'react';
import { Lock, ShieldCheck, ChevronRight } from 'lucide-react';
import { saveAuth } from '../services/storage';

interface LoginScreenProps {
  onSuccess: () => void;
}

// Valid codes - restricted to only '호두과자'
const VALID_CODES = ['호두과자'];

const LoginScreen: React.FC<LoginScreenProps> = ({ onSuccess }) => {
  const [code, setCode] = useState('');
  const [error, setError] = useState(false);
  const [shake, setShake] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (VALID_CODES.includes(code.trim())) {
      saveAuth();
      onSuccess();
    } else {
      setError(true);
      setShake(true);
      setTimeout(() => setShake(false), 500);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-600 to-brand-700 flex flex-col items-center justify-center p-6 text-white">
      <div className="w-full max-w-sm">
        <div className="mb-10 text-center animate-in fade-in zoom-in duration-500">
          <div className="mx-auto w-20 h-20 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center mb-6 shadow-xl border border-white/30">
            <Lock size={40} className="text-white" />
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight mb-2">Double Check</h1>
          <p className="text-brand-100 opacity-90 text-sm">사전점검 전문가를 위한 정밀 리포트</p>
        </div>

        <div className="bg-white/10 backdrop-blur-md rounded-2xl p-6 border border-white/20 shadow-2xl animate-in slide-in-from-bottom-5 duration-700">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="code" className="block text-sm font-medium text-brand-100 mb-2 ml-1">
                팀 코드 입력
              </label>
              <div className={`relative transition-transform ${shake ? 'translate-x-[-5px] translate-x-[5px]' : ''}`}>
                 <input
                  id="code"
                  type="text"
                  value={code}
                  onChange={(e) => {
                    setCode(e.target.value);
                    setError(false);
                  }}
                  placeholder="코드를 입력하세요"
                  className={`w-full px-4 py-3.5 rounded-xl bg-white/90 text-gray-900 placeholder:text-gray-400 font-bold text-center outline-none border-2 transition-colors ${error ? 'border-red-400 focus:border-red-400' : 'border-transparent focus:border-white'}`}
                  autoComplete="off"
                />
              </div>
              {error && (
                <p className="text-red-200 text-xs mt-2 text-center font-bold flex items-center justify-center gap-1 animate-in fade-in">
                  <ShieldCheck size={12}/> 잘못된 코드입니다. 다시 확인해주세요.
                </p>
              )}
            </div>

            <button
              type="submit"
              className="w-full bg-white text-brand-600 font-bold py-3.5 rounded-xl shadow-lg hover:bg-brand-50 transition active:scale-[0.98] flex items-center justify-center gap-2"
            >
              접속하기
              <ChevronRight size={18} />
            </button>
          </form>
        </div>

        <p className="mt-8 text-center text-xs text-brand-200/60 font-medium">
          Authorized Personnel Only<br/>
          Copyright © Double Check
        </p>
      </div>
    </div>
  );
};

export default LoginScreen;