#include <cstdint>
#include <cstdio>
#include <cstring>
#include <cstdarg>

#include <emscripten/emscripten.h>
#include "libretro.h"

namespace {

constexpr unsigned MAX_W = 1024;
constexpr unsigned MAX_H = 512;
constexpr size_t AUDIO_CAP = 8192;

retro_pixel_format pixel_format = RETRO_PIXEL_FORMAT_RGB565;
uint16_t pads[2] = {0, 0};
uint8_t rgba[MAX_W * MAX_H * 4];
int16_t audio[AUDIO_CAP * 2];
unsigned frame_w = 256;
unsigned frame_h = 224;
size_t audio_frames = 0;
double sample_rate = 32040.0;
bool ready = false;
uint8_t* state_buf = nullptr;
size_t state_cap = 0;
uint32_t state_hash = 0;

uint32_t fnv1a(const uint8_t* data, size_t len) {
    uint32_t hash = 2166136261u;
    for (size_t i = 0; i < len; i++) {
        hash ^= data[i];
        hash *= 16777619u;
    }
    return hash;
}

void log_printf(enum retro_log_level level, const char* fmt, ...) {
    (void)level;
    va_list ap;
    va_start(ap, fmt);
    vfprintf(stderr, fmt, ap);
    va_end(ap);
}

bool env_cb(unsigned cmd, void* data) {
    switch (cmd) {
    case RETRO_ENVIRONMENT_SET_PIXEL_FORMAT: {
        auto fmt = *static_cast<retro_pixel_format*>(data);
        if (fmt == RETRO_PIXEL_FORMAT_RGB565 ||
            fmt == RETRO_PIXEL_FORMAT_XRGB8888 ||
            fmt == RETRO_PIXEL_FORMAT_0RGB1555) {
            pixel_format = fmt;
            return true;
        }
        return false;
    }
    case RETRO_ENVIRONMENT_GET_CAN_DUPE:
        if (data) *static_cast<bool*>(data) = true;
        return true;
    case RETRO_ENVIRONMENT_GET_INPUT_BITMASKS:
        return true;
    case RETRO_ENVIRONMENT_GET_LOG_INTERFACE: {
        auto* log = static_cast<struct retro_log_callback*>(data);
        log->log = log_printf;
        return true;
    }
    case RETRO_ENVIRONMENT_GET_VARIABLE_UPDATE:
        if (data) *static_cast<bool*>(data) = false;
        return true;
    case RETRO_ENVIRONMENT_GET_VARIABLE:
        return false;
    case RETRO_ENVIRONMENT_GET_AUDIO_VIDEO_ENABLE:
    case RETRO_ENVIRONMENT_GET_SAVESTATE_CONTEXT:
    case RETRO_ENVIRONMENT_GET_SYSTEM_DIRECTORY:
    case RETRO_ENVIRONMENT_GET_SAVE_DIRECTORY:
        return false;
    case RETRO_ENVIRONMENT_SET_PERFORMANCE_LEVEL:
    case RETRO_ENVIRONMENT_SET_INPUT_DESCRIPTORS:
    case RETRO_ENVIRONMENT_SET_CONTROLLER_INFO:
    case RETRO_ENVIRONMENT_SET_GEOMETRY:
    case RETRO_ENVIRONMENT_SET_SUPPORT_ACHIEVEMENTS:
    case RETRO_ENVIRONMENT_SET_SUPPORT_NO_GAME:
    case RETRO_ENVIRONMENT_SET_VARIABLES:
    case RETRO_ENVIRONMENT_SET_CORE_OPTIONS:
    case RETRO_ENVIRONMENT_SET_CORE_OPTIONS_INTL:
    case RETRO_ENVIRONMENT_SET_CORE_OPTIONS_V2:
    case RETRO_ENVIRONMENT_SET_CORE_OPTIONS_V2_INTL:
    case RETRO_ENVIRONMENT_SET_CORE_OPTIONS_DISPLAY:
    case RETRO_ENVIRONMENT_SET_CORE_OPTIONS_UPDATE_DISPLAY_CALLBACK:
    case RETRO_ENVIRONMENT_SET_SERIALIZATION_QUIRKS:
        return true;
    default:
        return false;
    }
}

void video_cb(const void* data, unsigned width, unsigned height, size_t pitch) {
    if (!data || width == 0 || height == 0) return;
    if (width > MAX_W) width = MAX_W;
    if (height > MAX_H) height = MAX_H;
    frame_w = width;
    frame_h = height;
    auto* dst = rgba;
    if (pixel_format == RETRO_PIXEL_FORMAT_XRGB8888) {
        const auto* src = static_cast<const uint8_t*>(data);
        for (unsigned y = 0; y < height; y++) {
            const auto* row = src + y * pitch;
            for (unsigned x = 0; x < width; x++) {
                uint8_t b = row[x * 4 + 0];
                uint8_t g = row[x * 4 + 1];
                uint8_t r = row[x * 4 + 2];
                *dst++ = r;
                *dst++ = g;
                *dst++ = b;
                *dst++ = 255;
            }
        }
        return;
    }
    const auto* src = static_cast<const uint8_t*>(data);
    const bool rgb565 = pixel_format == RETRO_PIXEL_FORMAT_RGB565;
    for (unsigned y = 0; y < height; y++) {
        const auto* row = reinterpret_cast<const uint16_t*>(src + y * pitch);
        for (unsigned x = 0; x < width; x++) {
            uint16_t c = row[x];
            uint8_t r, g, b;
            if (rgb565) {
                r = (c >> 11) & 31;
                g = (c >> 5) & 63;
                b = c & 31;
                r = (r << 3) | (r >> 2);
                g = (g << 2) | (g >> 4);
                b = (b << 3) | (b >> 2);
            } else {
                r = (c >> 10) & 31;
                g = (c >> 5) & 31;
                b = c & 31;
                r = (r << 3) | (r >> 2);
                g = (g << 3) | (g >> 2);
                b = (b << 3) | (b >> 2);
            }
            *dst++ = r;
            *dst++ = g;
            *dst++ = b;
            *dst++ = 255;
        }
    }
}

size_t audio_batch(const int16_t* data, size_t frames) {
    size_t space = AUDIO_CAP - audio_frames;
    size_t n = frames < space ? frames : space;
    if (n) memcpy(audio + audio_frames * 2, data, n * 2 * sizeof(int16_t));
    audio_frames += n;
    return frames;
}

void audio_sample(int16_t left, int16_t right) {
    int16_t pair[2] = {left, right};
    audio_batch(pair, 1);
}

void input_poll(void) {}

int16_t input_state(unsigned port, unsigned device, unsigned index, unsigned id) {
    (void)index;
    if (device != RETRO_DEVICE_JOYPAD || port > 1) return 0;
    if (id == RETRO_DEVICE_ID_JOYPAD_MASK) return static_cast<int16_t>(pads[port]);
    if (id < 16) return (pads[port] >> id) & 1;
    return 0;
}

bool ensure_state() {
    size_t need = retro_serialize_size();
    if (!need) return false;
    if (need > state_cap) {
        delete[] state_buf;
        state_buf = new uint8_t[need];
        state_cap = need;
    }
    if (!retro_serialize(state_buf, need)) return false;
    state_hash = fnv1a(state_buf, need);
    return true;
}

}  // namespace

struct RFILE;

extern "C" {

RFILE* rfopen(const char*, const char*) { return nullptr; }
int64_t rfread(void*, size_t, size_t, RFILE*) { return 0; }
int rfclose(RFILE*) { return 0; }
int64_t rfseek(RFILE*, int64_t, int) { return -1; }
int64_t rftell(RFILE*) { return -1; }
int rfeof(RFILE*) { return 1; }
int rfgetc(RFILE*) { return -1; }
char* rfgets(char* buffer, int maxCount, RFILE*) {
    if (buffer && maxCount > 0) buffer[0] = 0;
    return nullptr;
}
int64_t rfwrite(const void*, size_t, size_t, RFILE*) { return 0; }
int rferror(RFILE*) { return 0; }

RFILE* filestream_open(const char*, unsigned, unsigned) { return nullptr; }
int64_t filestream_read(RFILE*, void*, int64_t) { return 0; }
int64_t filestream_write(RFILE*, const void*, int64_t) { return 0; }
int64_t filestream_seek(RFILE*, int64_t, int) { return -1; }
int64_t filestream_tell(RFILE*) { return -1; }
int filestream_close(RFILE*) { return 0; }
int filestream_eof(RFILE*) { return 1; }
int64_t filestream_get_size(RFILE*) { return -1; }
int64_t filestream_read_file(const char*, void** buf, int64_t* len) {
    if (buf) *buf = nullptr;
    if (len) *len = 0;
    return -1;
}

void* rinflate_new(int) { return nullptr; }
void rinflate_free(void*) {}
void rinflate_set_in(void*, const uint8_t*, size_t) {}
void rinflate_set_out(void*, uint8_t*, size_t) {}
int rinflate_process(void*, size_t* read, size_t* wrote) {
    if (read) *read = 0;
    if (wrote) *wrote = 0;
    return -2;
}

EMSCRIPTEN_KEEPALIVE
int snes_load(const uint8_t* data, int size) {
    if (!data || size <= 0) return 0;
    if (!ready) {
        retro_set_environment(env_cb);
        retro_set_video_refresh(video_cb);
        retro_set_audio_sample(audio_sample);
        retro_set_audio_sample_batch(audio_batch);
        retro_set_input_poll(input_poll);
        retro_set_input_state(input_state);
        retro_init();
        ready = true;
    }
    retro_game_info info{};
    info.data = data;
    info.size = static_cast<size_t>(size);
    if (!retro_load_game(&info)) return 0;
    retro_set_controller_port_device(0, RETRO_DEVICE_JOYPAD);
    retro_set_controller_port_device(1, RETRO_DEVICE_JOYPAD);
    retro_system_av_info av{};
    retro_get_system_av_info(&av);
    if (av.timing.sample_rate > 0) sample_rate = av.timing.sample_rate;
    pads[0] = pads[1] = 0;
    return 1;
}

EMSCRIPTEN_KEEPALIVE
void snes_set_input(int port, int buttons) {
    if (port < 0 || port > 1) return;
    pads[port] = static_cast<uint16_t>(buttons & 0xffff);
}

EMSCRIPTEN_KEEPALIVE
void snes_run_frame(void) {
    audio_frames = 0;
    retro_run();
}

EMSCRIPTEN_KEEPALIVE
int snes_width(void) { return static_cast<int>(frame_w); }

EMSCRIPTEN_KEEPALIVE
int snes_height(void) { return static_cast<int>(frame_h); }

EMSCRIPTEN_KEEPALIVE
uint8_t* snes_framebuffer(void) { return rgba; }

EMSCRIPTEN_KEEPALIVE
int snes_frame_bytes(void) { return static_cast<int>(frame_w * frame_h * 4); }

EMSCRIPTEN_KEEPALIVE
int16_t* snes_audiobuffer(void) { return audio; }

EMSCRIPTEN_KEEPALIVE
int snes_audio_frames(void) { return static_cast<int>(audio_frames); }

EMSCRIPTEN_KEEPALIVE
int snes_sample_rate(void) { return static_cast<int>(sample_rate); }

EMSCRIPTEN_KEEPALIVE
int snes_state_size(void) { return static_cast<int>(retro_serialize_size()); }

EMSCRIPTEN_KEEPALIVE
int snes_save_state(uint8_t* dst, int cap) {
    if (!ensure_state()) return 0;
    size_t need = retro_serialize_size();
    if (!dst || cap < static_cast<int>(need)) return 0;
    memcpy(dst, state_buf, need);
    return static_cast<int>(need);
}

EMSCRIPTEN_KEEPALIVE
int snes_load_state(const uint8_t* src, int len) {
    if (!src || len <= 0) return 0;
    if (!retro_unserialize(src, static_cast<size_t>(len))) return 0;
    return 1;
}

EMSCRIPTEN_KEEPALIVE
unsigned snes_state_hash(void) {
    if (!ensure_state()) return 0;
    return state_hash;
}

}
