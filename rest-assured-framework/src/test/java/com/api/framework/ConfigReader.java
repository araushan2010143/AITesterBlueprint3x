package com.api.framework;

import java.io.IOException;
import java.io.InputStream;
import java.util.Properties;

public class ConfigReader {
  private static final Properties PROPERTIES = new Properties();

  static {
    try (InputStream input = ConfigReader.class.getClassLoader().getResourceAsStream("config.properties")) {
      if (input == null) {
        throw new IllegalStateException("config.properties not found in classpath");
      }
      PROPERTIES.load(input);
    } catch (IOException e) {
      throw new RuntimeException("Failed to load config.properties", e);
    }
  }

  public static String get(String key) {
    return PROPERTIES.getProperty(key);
  }
}
