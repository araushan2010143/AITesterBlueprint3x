package com.salesforce.framework;

import java.io.IOException;
import java.io.InputStream;
import java.util.Properties;

public class ConfigReader {
  private static final Properties PROPERTIES = new Properties();

  static {
    try (InputStream input = ConfigReader.class.getClassLoader().getResourceAsStream("config.properties")) {
      if (input != null) {
        PROPERTIES.load(input);
      }
    } catch (IOException e) {
      throw new RuntimeException("Unable to load config.properties", e);
    }
  }

  public static String getProperty(String key) {
    return PROPERTIES.getProperty(key);
  }
}
