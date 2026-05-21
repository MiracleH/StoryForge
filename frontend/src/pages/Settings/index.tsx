import React, { useEffect, useState } from 'react';
import { Card, Form, Input, Button, Typography, message, Select, Divider, Space, Tag, Spin, Alert } from 'antd';
import { SaveOutlined, RobotOutlined, PictureOutlined, VideoCameraOutlined, AudioOutlined, ReloadOutlined, ApiOutlined } from '@ant-design/icons';
import { aiAPI } from '../../services/api';

const { Title, Text } = Typography;
const { Option } = Select;

const Settings: React.FC = () => {
  const [form] = Form.useForm();
  const [modelLists, setModelLists] = useState<Record<string, string[]>>({});
  const [loadingModels, setLoadingModels] = useState<Record<string, boolean>>({});
  const [testResult, setTestResult] = useState<{ ok: boolean; model: string; base_url: string; error?: string; hint?: string } | null>(null);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('settings');
    if (saved) {
      try {
        form.setFieldsValue(JSON.parse(saved));
      } catch {}
    }
  }, []);

  const handleSubmit = async (values: any) => {
    try {
      localStorage.setItem('settings', JSON.stringify(values));
      message.success('设置已保存');
    } catch {
      message.error('保存设置失败');
    }
  };

  const fetchModels = async (keyPrefix: string) => {
    const values = form.getFieldsValue();
    const apiKey = values[`${keyPrefix}_api_key`] || values['ai_api_key'];
    const baseUrl = values[`${keyPrefix}_base_url`] || values['ai_base_url'];

    if (!apiKey) {
      message.warning('请先填写 API Key');
      return;
    }

    setLoadingModels(prev => ({ ...prev, [keyPrefix]: true }));
    try {
      const res = await aiAPI.listModels({ base_url: baseUrl, api_key: apiKey });
      setModelLists(prev => ({ ...prev, [keyPrefix]: (res as any).data.models }));
      message.success(`获取到 ${(res as any).data.models.length} 个模型`);
    } catch (err: any) {
      message.error(err.message || '获取模型列表失败');
    } finally {
      setLoadingModels(prev => ({ ...prev, [keyPrefix]: false }));
    }
  };

  const testTextAI = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const values = form.getFieldsValue();
      const apiKey = values.ai_text_api_key || values.ai_api_key;
      const baseUrl = values.ai_text_base_url || values.ai_base_url;
      const res = await aiAPI.testText({
        model: values.ai_text_model,
        api_key: apiKey,
        base_url: baseUrl,
      });
      setTestResult((res as any).data);
    } catch (err: any) {
      setTestResult({ ok: false, model: '', base_url: '', error: err.message });
    } finally {
      setTesting(false);
    }
  };

  const AIGroup: React.FC<{
    title: string;
    icon: React.ReactNode;
    color: string;
    keyPrefix: string;
    modelPlaceholder: string;
    extra?: React.ReactNode;
    showTest?: boolean;
  }> = ({ title, icon, color, keyPrefix, modelPlaceholder, extra, showTest }) => {
    const models = modelLists[keyPrefix];
    const isLoading = loadingModels[keyPrefix];

    return (
      <Card size="small" style={{ marginBottom: 16 }} title={
        <Space>{icon}<Text strong>{title}</Text><Tag color={color}>{keyPrefix}</Tag></Space>
      }>
        <Form.Item name={`${keyPrefix}_api_key`} label="API Key" style={{ marginBottom: 12 }}>
          <Input.Password placeholder="留空则使用通用 AI_API_KEY" />
        </Form.Item>
        <Form.Item name={`${keyPrefix}_base_url`} label="API Base URL" style={{ marginBottom: 12 }}>
          <Input placeholder="https://api.openai.com/v1" />
        </Form.Item>
        <Form.Item name={`${keyPrefix}_model`} label="模型" style={{ marginBottom: 12 }}>
          {models && models.length > 0 ? (
            <Select
              showSearch
              placeholder="选择模型"
              optionFilterProp="children"
              allowClear
            >
              {models.map(m => <Option key={m} value={m}>{m}</Option>)}
            </Select>
          ) : (
            <Input placeholder={modelPlaceholder} />
          )}
        </Form.Item>
        <Space style={{ marginBottom: extra ? 12 : 0 }}>
          <Button
            size="small"
            icon={isLoading ? <Spin size="small" /> : <ReloadOutlined />}
            loading={isLoading}
            onClick={() => fetchModels(keyPrefix)}
          >
            获取模型列表
          </Button>
          {showTest && (
            <Button
              size="small"
              icon={<ApiOutlined />}
              loading={testing}
              onClick={testTextAI}
            >
              测试连接
            </Button>
          )}
        </Space>
        {extra}
      </Card>
    );
  };

  return (
    <div>
      <Title level={2}>系统设置</Title>

      <Card>
        <Form form={form} layout="vertical" onFinish={handleSubmit} initialValues={{
          ai_text_model: 'gpt-4o',
          ai_image_model: 'dall-e-3',
          ai_video_model: 'sora',
          ai_tts_model: 'tts-1',
          ai_tts_voice: 'alloy',
        }}>
          <Title level={4}>AI 服务配置</Title>
          <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
            各模块可独立配置不同的 API 地址和 Key。留空则使用通用配置。
          </Text>

          <AIGroup
            title="文本分析"
            icon={<RobotOutlined />}
            color="blue"
            keyPrefix="ai_text"
            modelPlaceholder="gpt-4o"
            showTest
          />

          {testResult && (
            <Alert
              type={testResult.ok ? 'success' : 'error'}
              showIcon
              message={testResult.ok ? '连接成功' : '连接失败'}
              description={
                <div>
                  <div>模型: {testResult.model} | Base URL: {testResult.base_url}</div>
                  {testResult.error && <div style={{ marginTop: 4 }}>错误: {testResult.error}</div>}
                  {testResult.hint && <div style={{ marginTop: 4, fontWeight: 500 }}>{testResult.hint}</div>}
                </div>
              }
              style={{ marginBottom: 16 }}
              closable
            />
          )}

          <AIGroup
            title="图片生成"
            icon={<PictureOutlined />}
            color="green"
            keyPrefix="ai_image"
            modelPlaceholder="dall-e-3"
          />

          <AIGroup
            title="视频生成"
            icon={<VideoCameraOutlined />}
            color="purple"
            keyPrefix="ai_video"
            modelPlaceholder="sora"
          />

          <AIGroup
            title="语音合成 (TTS)"
            icon={<AudioOutlined />}
            color="orange"
            keyPrefix="ai_tts"
            modelPlaceholder="tts-1"
            extra={
              <Form.Item name="ai_tts_voice" label="默认语音" style={{ marginBottom: 0, marginTop: 12 }}>
                <Select>
                  <Option value="alloy">Alloy</Option>
                  <Option value="echo">Echo</Option>
                  <Option value="fable">Fable</Option>
                  <Option value="onyx">Onyx</Option>
                  <Option value="nova">Nova</Option>
                  <Option value="shimmer">Shimmer</Option>
                </Select>
              </Form.Item>
            }
          />

          <Divider />

          <Title level={4}>通用配置</Title>

          <Form.Item name="ai_api_key" label="通用 API Key">
            <Input.Password placeholder="各模块未单独配置时使用此 Key" />
          </Form.Item>

          <Form.Item name="ai_base_url" label="通用 API Base URL">
            <Input placeholder="https://api.openai.com/v1" />
          </Form.Item>

          <Divider />

          <Title level={4}>界面设置</Title>

          <Form.Item name="theme" label="主题">
            <Select>
              <Option value="light">浅色主题</Option>
              <Option value="dark">深色主题</Option>
              <Option value="auto">跟随系统</Option>
            </Select>
          </Form.Item>

          <Form.Item name="language" label="语言">
            <Select>
              <Option value="zh-CN">简体中文</Option>
              <Option value="en-US">English</Option>
            </Select>
          </Form.Item>

          <Form.Item>
            <Button type="primary" htmlType="submit" icon={<SaveOutlined />} size="large">
              保存设置
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
};

export default Settings;
