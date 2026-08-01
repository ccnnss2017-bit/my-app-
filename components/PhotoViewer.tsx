
import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence, PanInfo } from 'framer-motion';
import { X, ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from 'lucide-react';

interface PhotoViewerProps {
  photos: string[];
  initialIndex: number;
  onClose: () => void;
}

const PhotoViewer: React.FC<PhotoViewerProps> = ({ photos, initialIndex, onClose }) => {
  const [index, setIndex] = useState(initialIndex);
  const [direction, setDirection] = useState(0);
  const [scale, setScale] = useState(1);
  
  // Reset scale when slide changes
  useEffect(() => {
    setScale(1);
  }, [index]);

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') paginate(-1);
      if (e.key === 'ArrowRight') paginate(1);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [index]);

  const paginate = (newDirection: number) => {
    if (scale > 1) {
        setScale(1);
        setTimeout(() => {
            const newIndex = index + newDirection;
            if (newIndex >= 0 && newIndex < photos.length) {
                setDirection(newDirection);
                setIndex(newIndex);
            }
        }, 50); 
    } else {
        const newIndex = index + newDirection;
        if (newIndex >= 0 && newIndex < photos.length) {
          setDirection(newDirection);
          setIndex(newIndex);
        }
    }
  };

  const toggleZoom = () => {
    setScale(prev => (prev === 1 ? 2.5 : 1));
  };

  const variants = {
    enter: (direction: number) => ({
      x: direction > 0 ? 500 : -500,
      opacity: 0,
      scale: 0.8
    }),
    center: {
      zIndex: 1,
      x: 0,
      opacity: 1,
      scale: 1
    },
    exit: (direction: number) => ({
      zIndex: 0,
      x: direction < 0 ? 500 : -500,
      opacity: 0,
      scale: 0.8
    })
  };

  const swipeConfidenceThreshold = 10000;
  const swipePower = (offset: number, velocity: number) => {
    return Math.abs(offset) * velocity;
  };

  const handleDragEnd = (e: any, { offset, velocity }: PanInfo) => {
    // Only allow swipe navigation if not zoomed in
    if (scale === 1) {
      const swipe = swipePower(offset.x, velocity.x);

      if (swipe < -swipeConfidenceThreshold) {
        paginate(1);
      } else if (swipe > swipeConfidenceThreshold) {
        paginate(-1);
      }
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] bg-black/95 flex flex-col items-center justify-center touch-none"
    >
      {/* Header controls */}
      <div className="absolute top-0 left-0 right-0 p-4 z-20 flex justify-between items-center text-white pb-safe pt-safe-top">
        <div className="text-sm font-medium tracking-wider">
          {index + 1} / {photos.length}
        </div>
        <div className="flex gap-4">
           <button 
            onClick={toggleZoom}
            className="p-2 bg-white/10 rounded-full hover:bg-white/20 transition backdrop-blur-md"
           >
             {scale === 1 ? <ZoomIn size={20} /> : <ZoomOut size={20} />}
           </button>
           <button 
            onClick={onClose}
            className="p-2 bg-white/10 rounded-full hover:bg-white/20 transition backdrop-blur-md"
           >
            <X size={20} />
          </button>
        </div>
      </div>

      {/* Main Image Container */}
      <div className="relative w-full h-full flex items-center justify-center overflow-hidden">
        <AnimatePresence initial={false} custom={direction}>
          <motion.img
            key={index}
            src={photos[index]}
            custom={direction}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{
              x: { type: "spring", stiffness: 300, damping: 30 },
              opacity: { duration: 0.2 },
              scale: { duration: 0 } // Instant zoom, no animation
            }}
            drag={scale > 1 ? true : "x"} // Pan if zoomed, swipe x if not
            dragConstraints={scale > 1 ? { left: -500, right: 500, top: -500, bottom: 500 } : { left: 0, right: 0 }}
            dragElastic={scale > 1 ? 0.1 : 1}
            onDragEnd={handleDragEnd}
            onClick={(e) => e.stopPropagation()}
            onDoubleClick={toggleZoom}
            className="absolute max-h-[85vh] max-w-[95vw] object-contain shadow-2xl cursor-grab active:cursor-grabbing"
            style={{ 
                scale: scale, 
                touchAction: 'none' 
            }} 
          />
        </AnimatePresence>

        {/* Navigation Buttons (Desktop/Tablet) */}
        {index > 0 && (
          <button 
            className="absolute left-4 p-3 bg-white/10 rounded-full text-white hover:bg-white/20 transition hidden md:block z-10"
            onClick={(e) => { e.stopPropagation(); paginate(-1); }}
          >
            <ChevronLeft size={24} />
          </button>
        )}
        {index < photos.length - 1 && (
          <button 
            className="absolute right-4 p-3 bg-white/10 rounded-full text-white hover:bg-white/20 transition hidden md:block z-10"
            onClick={(e) => { e.stopPropagation(); paginate(1); }}
          >
            <ChevronRight size={24} />
          </button>
        )}
      </div>

      {/* Footer / Caption area if needed */}
      <div className="absolute bottom-10 flex gap-2 z-20 pb-safe">
        {photos.map((_, i) => (
          <div 
            key={i} 
            className={`w-1.5 h-1.5 rounded-full transition-all duration-300 
              ${i === index ? 'bg-white w-3' : 'bg-white/40'}`}
          />
        ))}
      </div>
    </motion.div>
  );
};

export default PhotoViewer;
