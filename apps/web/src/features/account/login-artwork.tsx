import { ScenicImage } from '../../components/scenic-image';
import { publicMedia } from '../../platform/public-media';

export function LoginArtwork() {
  return (
    <section className="postcard-story" aria-label="Cảm hứng chuyến đi Đà Lạt">
      <div className="postcard-arrival">
        <span className="postcard-paint postcard-paint-peach" aria-hidden="true" />
        <span className="postcard-paint postcard-paint-teal" aria-hidden="true" />
        <svg className="postcard-plane" aria-hidden="true" viewBox="0 0 180 130" fill="none">
          <path
            d="m22 18 49 8-32 15-17-23 15 8 2 15 8-13-25-10Z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          <path
            d="M58 53c11 36 59 64 102 25"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeDasharray="6 7"
            strokeLinecap="round"
          />
        </svg>
        <figure className="dalat-postcard postcard-photo-main">
          <ScenicImage
            source={import.meta.env.VITE_CLOUDINARY_LOGIN_LAKE_URL || publicMedia.loginLake}
            fallbackSrc="/login-lake-fallback.webp"
            width={1086}
            height={1448}
            alt="Minh họa hồ nước và đồi thông trong nắng sớm Đà Lạt"
            sizes="(max-width: 600px) 62vw, (max-width: 1023px) 280px, 400px"
            priority
          />
        </figure>
        <figure className="postcard-photo-secondary">
          <ScenicImage
            source={import.meta.env.VITE_CLOUDINARY_LOGIN_LANE_URL || publicMedia.loginLane}
            fallbackSrc="/login-lane-fallback.webp"
            width={1086}
            height={1448}
            alt="Minh họa con ngõ nhỏ với hoa và những ngôi nhà trên đồi"
            sizes="(max-width: 600px) 37vw, (max-width: 1023px) 170px, 240px"
            priority
          />
        </figure>
        <svg className="postcard-sun-strokes" aria-hidden="true" viewBox="0 0 90 65" fill="none">
          <path
            d="m12 39 12-23-3 20m14 3 23-25-14 24m5 10 28-7-24 13"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <p className="postcard-photo-label">Một chút Đà Lạt, một trời cảm hứng.</p>
      </div>
    </section>
  );
}

export function JourneySketch() {
  return (
    <div className="journey-sketch" aria-hidden="true">
      <svg viewBox="0 0 420 125" fill="none">
        <circle cx="309" cy="65" r="25" fill="#ffb878" opacity=".85" />
        <g stroke="#526467" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M0 57 19 48q7-4 15 3l65 48 54-31q10-6 20 2l44 28 26-14q8-5 18 2l58 31M74 80l20-5 30 17m74-8 13-3 38 26M0 110q155-9 263 2t157 10" />
          <path d="m56 111-1-32q0-8 10-8h47q8 0 11 10l4 29H56Zm1-17h68M64 77h13v13H63l1-13Zm18 0h13v13H82V77Zm18 0h12l5 13h-17V77Zm-20 18v16m-20-12h12m34 0h14M52 111h78" />
          <circle cx="69" cy="111" r="7" fill="#fffaf1" />
          <circle cx="114" cy="111" r="7" fill="#fffaf1" />
          <path d="m18 109-1-24m0 13-7-8m7 3 8-10m-6 3 2-12m-4 14-5-11M144 119l45 1m-178 0 20 1" />
        </g>
      </svg>
      <span>
        Good trips.
        <br />
        Brighter days.
      </span>
    </div>
  );
}
