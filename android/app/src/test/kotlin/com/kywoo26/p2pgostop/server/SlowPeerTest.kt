package com.kywoo26.p2pgostop.server

import java.io.DataInputStream
import java.io.DataOutputStream
import java.net.InetSocketAddress
import java.net.ServerSocket
import java.net.Socket
import java.nio.charset.StandardCharsets
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class SlowPeerTest {
    @Test fun `읽지 않는 TCP 게스트의 큐가 차면 호스트는 left를 받고 역할이 해제된다`() {
        val port = ServerSocket(0).use { it.localPort }
        val logs = CopyOnWriteArrayList<String>()
        val env = ServerEnv("test", "abcdef0", "2026-09-28T00:00:00Z", { emptyMap() }, logs::add)
        val server = startSmokeServer(env, port)
        val writer = Executors.newSingleThreadExecutor()
        try {
            val guest = connect(port, "/ws?role=guest", receiveBuffer = 1_024)
            guest.use {
                val host = connect(port, "/ws?role=host")
                host.use {
                    assertEquals("{\"t\":\"relay\",\"peer\":\"present\"}", readTextFrame(host))
                    val sending = writer.submit {
                        val out = DataOutputStream(host.getOutputStream())
                        repeat(512) { writeMaskedText(out, ByteArray(MAX_MESSAGE_BYTES) { 'x'.code.toByte() }) }
                    }
                    val notices = mutableListOf<String>()
                    while (notices.none { it.contains("\"peer\":\"left\"") }) {
                        notices.add(readTextFrame(host))
                    }
                    assertEquals(1, notices.count { it.contains("\"peer\":\"absent\"") })
                    assertEquals(1, notices.count { it.contains("\"peer\":\"left\"") })
                    assertTrue(logs.any { it.contains("송신 큐 초과") })
                    assertTrue(!env.roles.guest.get())
                    sending.cancel(true)
                }
            }
        } finally {
            writer.shutdownNow()
            writer.awaitTermination(2, TimeUnit.SECONDS)
            server.stop(500, 1_500)
        }
    }

    private fun connect(port: Int, path: String, receiveBuffer: Int? = null): Socket {
        var socket: Socket? = null
        for (attempt in 0 until 50) {
            val candidate = Socket()
            if (receiveBuffer != null) candidate.receiveBufferSize = receiveBuffer
            candidate.soTimeout = 10_000
            try {
                candidate.connect(InetSocketAddress("127.0.0.1", port), 200)
                socket = candidate
                break
            } catch (_: java.net.ConnectException) {
                candidate.close()
                Thread.sleep(20)
            }
        }
        val connected = socket ?: error("CIO 서버가 포트 $port 에 열리지 않음")
        val request = "GET $path HTTP/1.1\r\nHost: 127.0.0.1:$port\r\n" +
            "Upgrade: websocket\r\nConnection: Upgrade\r\n" +
            "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n"
        connected.getOutputStream().write(request.toByteArray(StandardCharsets.US_ASCII))
        val input = connected.getInputStream()
        val header = StringBuilder()
        while (!header.toString().endsWith("\r\n\r\n")) header.append(input.read().toChar())
        assertTrue(header.toString().startsWith("HTTP/1.1 101"), header.toString())
        return connected
    }

    private fun writeMaskedText(out: DataOutputStream, data: ByteArray) {
        out.writeByte(0x81)
        out.writeByte(0xff)
        out.writeLong(data.size.toLong())
        val mask = byteArrayOf(1, 2, 3, 4)
        out.write(mask)
        for (i in data.indices) data[i] = (data[i].toInt() xor mask[i % 4].toInt()).toByte()
        out.write(data)
        out.flush()
    }

    private fun readTextFrame(socket: Socket): String {
        val input = DataInputStream(socket.getInputStream())
        val opcode = input.readUnsignedByte() and 0x0f
        val sizeByte = input.readUnsignedByte()
        val size = when (sizeByte and 0x7f) {
            126 -> input.readUnsignedShort().toLong()
            127 -> input.readLong()
            else -> (sizeByte and 0x7f).toLong()
        }
        val payload = ByteArray(size.toInt())
        input.readFully(payload)
        assertEquals(1, opcode)
        return String(payload, StandardCharsets.UTF_8)
    }
}
